import { useEffect, useState } from 'react';

interface ServerConfig {
    id?: string;
    accountName: string;
    imapHost: string;
    imapPort: number;
    imapSslEnabled: boolean;
    imapUsername: string;
    imapPassword: string;
    smtpHost: string;
    smtpPort: number;
    smtpSslEnabled: boolean;
    smtpUsername: string;
    smtpPassword: string;
}

interface ServerConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (config: ServerConfig) => Promise<void>;
    initialData?: ServerConfig | null;
    mode: 'create' | 'edit';
}

export default function ServerConfigModal({ isOpen, onClose, onSave, initialData, mode }: ServerConfigModalProps) {
    const [formData, setFormData] = useState<ServerConfig>({
        accountName: '',
        imapHost: '',
        imapPort: 993,
        imapSslEnabled: true,
        imapUsername: '',
        imapPassword: '',
        smtpHost: '',
        smtpPort: 465,
        smtpSslEnabled: true,
        smtpUsername: '',
        smtpPassword: '',
    });
    const [isSaving, setIsSaving] = useState(false);
    const [email, setEmail] = useState('');
    const [isAutoConfiguring, setIsAutoConfiguring] = useState(false);
    const [showManualConfig, setShowManualConfig] = useState(false);

    useEffect(() => {
        if (isOpen && initialData) {
            setFormData({
                id: initialData.id,
                accountName: initialData.accountName,
                imapHost: initialData.imapHost,
                imapPort: initialData.imapPort,
                imapSslEnabled: initialData.imapSslEnabled,
                imapUsername: initialData.imapUsername,
                imapPassword: '', // Don't populate password for security
                smtpHost: initialData.smtpHost,
                smtpPort: initialData.smtpPort,
                smtpSslEnabled: initialData.smtpSslEnabled,
                smtpUsername: initialData.smtpUsername,
                smtpPassword: '', // Don't populate password for security
            });
            setShowManualConfig(true); // Always show manual config in edit mode
        } else if (isOpen && !initialData) {
            // Reset form for create mode
            setFormData({
                accountName: '',
                imapHost: '',
                imapPort: 993,
                imapSslEnabled: true,
                imapUsername: '',
                imapPassword: '',
                smtpHost: '',
                smtpPort: 465,
                smtpSslEnabled: true,
                smtpUsername: '',
                smtpPassword: '',
            });
            setEmail('');
            setShowManualConfig(false); // Start with easy setup
        }
    }, [isOpen, initialData]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await onSave(formData);
            onClose();
        } catch (error) {
            console.error('Failed to save:', error);
            alert('保存に失敗しました。');
        } finally {
            setIsSaving(false);
        }
    };

    const handleChange = (field: keyof ServerConfig, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleAutoConfig = async () => {
        if (!email || !email.includes('@')) {
            alert('有効なメールアドレスを入力してください');
            return;
        }

        setIsAutoConfiguring(true);
        try {
            const { autoConfig } = await import('../lib/api');
            const result = await autoConfig(email);

            // Check if we got a valid config from any source
            const validSources = ['ispdb', 'autoconfig_subdomain', 'well_known', 'well_known_http'];
            if (validSources.includes(result.source) && result.xml) {
                // Parse XML to extract server settings
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(result.xml, 'text/xml');

                // Check for parsing errors
                const parserError = xmlDoc.querySelector('parsererror');
                if (parserError) {
                    console.error('XML parsing error:', parserError.textContent);
                    alert('設定の解析に失敗しました。手動で設定を入力してください。');
                    setShowManualConfig(true);
                    return;
                }

                // Extract IMAP settings
                const imapServer = xmlDoc.querySelector('emailProvider incomingServer[type="imap"]');
                if (imapServer) {
                    const imapHost = imapServer.querySelector('hostname')?.textContent || '';
                    const imapPort = parseInt(imapServer.querySelector('port')?.textContent || '993');
                    const socketType = imapServer.querySelector('socketType')?.textContent;
                    const imapSsl = socketType === 'SSL' || socketType === 'STARTTLS';

                    handleChange('imapHost', imapHost);
                    handleChange('imapPort', imapPort);
                    handleChange('imapSslEnabled', imapSsl);
                }

                // Extract SMTP settings
                const smtpServer = xmlDoc.querySelector('emailProvider outgoingServer[type="smtp"]');
                if (smtpServer) {
                    const smtpHost = smtpServer.querySelector('hostname')?.textContent || '';
                    const smtpPort = parseInt(smtpServer.querySelector('port')?.textContent || '465');
                    const socketType = smtpServer.querySelector('socketType')?.textContent;
                    const smtpSsl = socketType === 'SSL' || socketType === 'STARTTLS';

                    handleChange('smtpHost', smtpHost);
                    handleChange('smtpPort', smtpPort);
                    handleChange('smtpSslEnabled', smtpSsl);
                }

                // Set username fields
                handleChange('imapUsername', email);
                handleChange('smtpUsername', email);
                handleChange('accountName', email.split('@')[1]); // Use domain as account name

                setShowManualConfig(true);
                alert('サーバー設定を自動検出しました！');
            } else {
                alert('自動設定が見つかりませんでした。手動で設定を入力してください。');
                setShowManualConfig(true);
            }
        } catch (error) {
            console.error('Auto config failed:', error);
            alert('自動設定に失敗しました。手動で設定を入力してください。');
            setShowManualConfig(true);
        } finally {
            setIsAutoConfiguring(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="bg-white md:rounded-xl shadow-xl w-full max-w-3xl relative z-10 flex flex-col h-full md:h-auto md:max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-4 md:p-6 border-b border-gray-200">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800">
                            {mode === 'edit' ? 'メールアカウント編集' : '新規メールアカウント追加'}
                        </h2>
                        {mode === 'edit' && (
                            <p className="text-sm text-gray-500 mt-1">アカウント設定を変更します</p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
                    <div className="p-4 md:p-6 space-y-6 overflow-y-auto flex-1">
                        {/* Easy Setup for Create Mode */}
                        {mode === 'create' && !showManualConfig && (
                            <div className="max-w-md mx-auto text-center py-8">
                                <div className="mb-6">
                                    <div className="w-16 h-16 bg-brand-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-brand-600">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                                        </svg>
                                    </div>
                                    <h3 className="text-xl font-bold text-gray-800 mb-2">簡単セットアップ</h3>
                                    <p className="text-gray-600 text-sm">メールアドレスを入力すると、サーバー設定を自動検出します</p>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2 text-left">
                                            メールアドレス <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                                            placeholder="user@example.com"
                                            disabled={isAutoConfiguring}
                                        />
                                    </div>

                                    <button
                                        type="button"
                                        onClick={handleAutoConfig}
                                        disabled={isAutoConfiguring || !email}
                                        className="w-full px-6 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-bold shadow-sm flex items-center justify-center gap-2"
                                    >
                                        {isAutoConfiguring ? (
                                            <>
                                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                設定を検出中...
                                            </>
                                        ) : (
                                            <>
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                                                </svg>
                                                自動設定
                                            </>
                                        )}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setShowManualConfig(true)}
                                        className="w-full text-sm text-gray-600 hover:text-gray-800 py-2"
                                    >
                                        手動で設定を入力
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Manual Configuration */}
                        {(mode === 'edit' || showManualConfig) && (
                            <>
                        {/* Account Name */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                アカウント名 <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={formData.accountName}
                                onChange={(e) => handleChange('accountName', e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                                placeholder="例: 会社用Gmail"
                                required
                            />
                        </div>

                        {/* IMAP Settings */}
                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                            <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-brand-600">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 3.75H6.912a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H15M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859M12 3v8.25m0 0l-3-3m3 3l3-3" />
                                </svg>
                                IMAP設定 (受信)
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        IMAPホスト <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.imapHost}
                                        onChange={(e) => handleChange('imapHost', e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                                        placeholder="例: imap.gmail.com"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        ポート <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.imapPort}
                                        onChange={(e) => handleChange('imapPort', parseInt(e.target.value))}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        SSL/TLS
                                    </label>
                                    <div className="flex items-center h-[42px]">
                                        <input
                                            type="checkbox"
                                            checked={formData.imapSslEnabled}
                                            onChange={(e) => handleChange('imapSslEnabled', e.target.checked)}
                                            className="w-5 h-5 text-brand-600 border-gray-300 rounded focus:ring-brand-500"
                                        />
                                        <span className="ml-2 text-sm text-gray-600">SSL/TLSを使用</span>
                                    </div>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        IMAPユーザー名 <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.imapUsername}
                                        onChange={(e) => handleChange('imapUsername', e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                                        placeholder="例: user@example.com"
                                        required
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        IMAPパスワード {mode === 'edit' && <span className="text-gray-500 text-xs">(変更する場合のみ入力)</span>}
                                        {mode === 'create' && <span className="text-red-500">*</span>}
                                    </label>
                                    <input
                                        type="password"
                                        value={formData.imapPassword}
                                        onChange={(e) => handleChange('imapPassword', e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                                        placeholder={mode === 'edit' ? '変更しない場合は空欄' : 'パスワードを入力'}
                                        required={mode === 'create'}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* SMTP Settings */}
                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                            <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-brand-600">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                                </svg>
                                SMTP設定 (送信)
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        SMTPホスト <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.smtpHost}
                                        onChange={(e) => handleChange('smtpHost', e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                                        placeholder="例: smtp.gmail.com"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        ポート <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.smtpPort}
                                        onChange={(e) => handleChange('smtpPort', parseInt(e.target.value))}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        SSL/TLS
                                    </label>
                                    <div className="flex items-center h-[42px]">
                                        <input
                                            type="checkbox"
                                            checked={formData.smtpSslEnabled}
                                            onChange={(e) => handleChange('smtpSslEnabled', e.target.checked)}
                                            className="w-5 h-5 text-brand-600 border-gray-300 rounded focus:ring-brand-500"
                                        />
                                        <span className="ml-2 text-sm text-gray-600">SSL/TLSを使用</span>
                                    </div>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        SMTPユーザー名 <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.smtpUsername}
                                        onChange={(e) => handleChange('smtpUsername', e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                                        placeholder="例: user@example.com"
                                        required
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        SMTPパスワード {mode === 'edit' && <span className="text-gray-500 text-xs">(変更する場合のみ入力)</span>}
                                        {mode === 'create' && <span className="text-red-500">*</span>}
                                    </label>
                                    <input
                                        type="password"
                                        value={formData.smtpPassword}
                                        onChange={(e) => handleChange('smtpPassword', e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                                        placeholder={mode === 'edit' ? '変更しない場合は空欄' : 'パスワードを入力'}
                                        required={mode === 'create'}
                                    />
                                </div>
                            </div>
                        </div>
                            </>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-4 md:p-6 border-t bg-gray-50 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors font-medium text-sm"
                        >
                            キャンセル
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="px-6 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-bold shadow-sm flex items-center gap-2"
                        >
                            {isSaving ? (
                                <>
                                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    保存中...
                                </>
                            ) : (
                                <>
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                    </svg>
                                    {mode === 'edit' ? '更新' : '追加'}
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
