import { useEffect, useRef, useState } from 'react';
import { addServerConfig, autoConfig, deleteServerConfig, getServerConfigs, updateServerConfig } from '../lib/api';

export default function SettingsPage() {
    const [email, setEmail] = useState('');
    const [accountName, setAccountName] = useState('');
    const [loading, setLoading] = useState(false);
    const [config, setConfig] = useState({
        imapHost: '', imapPort: 993, imapSsl: true,
        smtpHost: '', smtpPort: 465, smtpSsl: true,
        username: '', password: ''
    });

    const [editingId, setEditingId] = useState<number | null>(null);
    const [existingAccounts, setExistingAccounts] = useState<any[]>([]);
    const formRef = useRef<HTMLDivElement>(null);

    const loadAccounts = async () => {
        try {
            const accounts = await getServerConfigs();
            setExistingAccounts(accounts);
        } catch (err) {
            console.error('Failed to load accounts', err);
        }
    };

    useEffect(() => {
        loadAccounts();
    }, []);

    const handleAutoConfig = async () => {
        if (!email) return;
        setLoading(true);
        try {
            const data = await autoConfig(email);
            console.log('AutoConfig Result:', data);

            if (data.source === 'ispdb' || data.xml) {
                // Mock populate relative to domain since parser isn't fully ready or backend returns raw XML
                if (email.includes('gmail')) {
                    setConfig(prev => ({
                        ...prev,
                        imapHost: 'imap.gmail.com', imapPort: 993, imapSsl: true,
                        smtpHost: 'smtp.gmail.com', smtpPort: 465, smtpSsl: true,
                        username: email
                    }));
                } else if (email.includes('outlook') || email.includes('hotmail')) {
                    setConfig(prev => ({
                        ...prev,
                        imapHost: 'outlook.office365.com', imapPort: 993, imapSsl: true,
                        smtpHost: 'smtp.office365.com', smtpPort: 587, smtpSsl: false, // StartTLS usually
                        username: email
                    }));
                } else {
                    alert('Auto-config data received but auto-fill logic is minimal for this demo.');
                }
            } else {
                alert('Auto-configuration not found. Please enter manually.');
            }

            // Only auto-fill name/username if not editing or fields are empty
            if (!editingId) {
                if (!accountName) setAccountName(email);
                if (!config.username) setConfig(prev => ({ ...prev, username: email }));
            }

        } catch (err) {
            console.error(err);
            alert('Failed to fetch settings');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const payload = {
            AccountName: accountName || email,
            ImapHost: config.imapHost,
            ImapPort: config.imapPort,
            ImapUsername: config.username,
            ImapPassword: config.password,
            ImapSslEnabled: config.imapSsl,
            SmtpHost: config.smtpHost,
            SmtpPort: config.smtpPort,
            SmtpUsername: config.username,
            SmtpPassword: config.password, // Reusing same password/user for both for simplicity
            SmtpSslEnabled: config.smtpSsl
        };

        try {
            if (editingId !== null) {
                await updateServerConfig(editingId, payload);
                alert('Account updated successfully!');
            } else {
                await addServerConfig(payload);
                alert('Account added successfully!');
            }

            resetForm();
            loadAccounts(); // Refresh list
        } catch (err) {
            console.error(err);
            alert('Failed to save account');
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (acc: any) => {
        setEditingId(acc.id);
        setAccountName(acc.accountName);
        setEmail(acc.imapUsername); // Assuming email is username
        setConfig({
            imapHost: acc.imapHost,
            imapPort: acc.imapPort,
            imapSsl: acc.imapSslEnabled,
            smtpHost: acc.smtpHost,
            smtpPort: acc.smtpPort,
            smtpSsl: acc.smtpSslEnabled,
            username: acc.imapUsername,
            password: '' // Don't show password
        });

        // Scroll to form
        formRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this account?')) return;

        try {
            await deleteServerConfig(id);
            setExistingAccounts(prev => prev.filter(a => a.id !== id));
            if (editingId === id) resetForm();
        } catch (err) {
            console.error(err);
            alert('Failed to delete account');
        }
    };

    const resetForm = () => {
        setEditingId(null);
        setEmail('');
        setAccountName('');
        setConfig({
            imapHost: '', imapPort: 993, imapSsl: true,
            smtpHost: '', smtpPort: 465, smtpSsl: true,
            username: '', password: ''
        });
    };

    return (
        <div className="max-w-4xl mx-auto p-6">
            <h1 className="text-2xl font-bold mb-6">Server Settings</h1>

            {/* Existing Accounts List */}
            <div className="bg-white p-6 rounded-lg shadow mb-8">
                <h2 className="text-lg font-semibold mb-4">Connected Accounts</h2>
                {existingAccounts.length === 0 ? (
                    <p className="text-gray-500">No accounts connected.</p>
                ) : (
                    <ul className="divide-y divide-gray-100">
                        {existingAccounts.map((acc: any) => (
                            <li key={acc.id} className="py-3 flex justify-between items-center">
                                <div>
                                    <div className="font-medium">{acc.accountName}</div>
                                    <div className="text-sm text-gray-500">{acc.imapUsername}</div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button onClick={() => handleEdit(acc)} className="text-sm text-brand-600 hover:text-brand-800 font-medium">Edit</button>
                                    <button onClick={() => handleDelete(acc.id)} className="text-sm text-red-600 hover:text-red-800 font-medium">Delete</button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div ref={formRef} className="bg-white p-6 rounded-lg shadow mb-8">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-semibold">{editingId ? 'Edit Account' : 'Add New Account'}</h2>
                    {editingId && (
                        <button onClick={resetForm} className="text-sm text-gray-500 hover:text-gray-700">Cancel Edit</button>
                    )}
                </div>

                <div className="flex gap-4 mb-6">
                    <input
                        type="email"
                        placeholder="Enter your email address"
                        className="flex-1 border p-2 rounded"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                    />
                    <button
                        onClick={handleAutoConfig}
                        disabled={loading}
                        className="bg-brand-600 text-white px-4 py-2 rounded hover:bg-brand-700 disabled:opacity-50"
                    >
                        {loading ? 'Detecting...' : 'Auto Detect'}
                    </button>
                </div>

                <div className="mb-6">
                    <label className="block text-sm text-gray-700 mb-1">Account Name (Optional)</label>
                    <input
                        type="text"
                        placeholder="e.g. Work Email"
                        className="w-full border p-2 rounded"
                        value={accountName}
                        onChange={e => setAccountName(e.target.value)}
                    />
                </div>

                <form onSubmit={handleSave} className="grid grid-cols-2 gap-6">
                    <div>
                        <h3 className="font-medium mb-3">Incoming Mail (IMAP)</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-sm text-gray-700">Server Hostname</label>
                                <input type="text" className="w-full border p-2 rounded" value={config.imapHost} onChange={e => setConfig({ ...config, imapHost: e.target.value })} required />
                            </div>
                            <div className="flex gap-4">
                                <div className="w-1/3">
                                    <label className="block text-sm text-gray-700">Port</label>
                                    <input type="number" className="w-full border p-2 rounded" value={config.imapPort} onChange={e => setConfig({ ...config, imapPort: parseInt(e.target.value) })} required />
                                </div>
                                <div className="flex items-center pt-6">
                                    <label className="flex items-center gap-2">
                                        <input type="checkbox" checked={config.imapSsl} onChange={e => setConfig({ ...config, imapSsl: e.target.checked })} />
                                        <span className="text-sm">SSL/TLS</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h3 className="font-medium mb-3">Outgoing Mail (SMTP)</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-sm text-gray-700">Server Hostname</label>
                                <input type="text" className="w-full border p-2 rounded" value={config.smtpHost} onChange={e => setConfig({ ...config, smtpHost: e.target.value })} required />
                            </div>
                            <div className="flex gap-4">
                                <div className="w-1/3">
                                    <label className="block text-sm text-gray-700">Port</label>
                                    <input type="number" className="w-full border p-2 rounded" value={config.smtpPort} onChange={e => setConfig({ ...config, smtpPort: parseInt(e.target.value) })} required />
                                </div>
                                <div className="flex items-center pt-6">
                                    <label className="flex items-center gap-2">
                                        <input type="checkbox" checked={config.smtpSsl} onChange={e => setConfig({ ...config, smtpSsl: e.target.checked })} />
                                        <span className="text-sm">SSL/TLS</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="col-span-2 border-t pt-4">
                        <h3 className="font-medium mb-3">Authentication</h3>
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm text-gray-700">Username</label>
                                <input type="text" className="w-full border p-2 rounded" value={config.username} onChange={e => setConfig({ ...config, username: e.target.value })} required />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-700">Password</label>
                                <input type="password" placeholder={editingId ? 'Leave blank to keep unchanged' : ''} className="w-full border p-2 rounded" value={config.password} onChange={e => setConfig({ ...config, password: e.target.value })} required={!editingId} />
                            </div>
                        </div>
                    </div>

                    <div className="col-span-2 pt-4 flex justify-end">
                        <button type="submit" disabled={loading} className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 disabled:opacity-50">
                            {loading ? 'Processing...' : (editingId ? 'Update Account' : 'Save Account')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
