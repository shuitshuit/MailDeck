import { useEffect, useState } from 'react';
import { getContacts } from '../lib/api';

export interface Account {
    id: number;
    accountName: string;
}

interface ComposeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSend: (to: string, subject: string, body: string, configId: number) => Promise<void>;
    accounts: Account[];
    initialTo?: string;
}

export default function ComposeModal({ isOpen, onClose, onSend, accounts, initialTo = '' }: ComposeModalProps) {
    const [to, setTo] = useState(initialTo);
    // Initialize with the first account ID if available
    const [configId, setConfigId] = useState<number | undefined>(undefined);
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [contacts, setContacts] = useState<{ name: string, email: string }[]>([]);

    useEffect(() => {
        getContacts().then(setContacts).catch(console.error);
    }, []);

    useEffect(() => {
        if (isOpen) {
            setTo(initialTo);
            // If no account selected, or selected account not in list, select first one
            if (accounts.length > 0) {
                const isValid = configId !== undefined && accounts.some(a => a.id === configId);
                if (!isValid) {
                    setConfigId(accounts[0].id);
                }
            }
        }
    }, [isOpen, initialTo, accounts, configId]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (configId === undefined) {
            alert('アカウントを選択してください');
            return;
        }
        setIsSending(true);
        try {
            await onSend(to, subject, body, configId);
            // Reset form
            setTo('');
            setSubject('');
            setBody('');
            onClose();
        } catch (error) {
            console.error('Failed to send:', error);
            alert('送信に失敗しました。');
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl relative z-10 flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-4 border-b">
                    <h2 className="text-lg font-bold text-gray-800">新規メール作成</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700 p-1 rounded-full hover:bg-gray-100"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
                    <div className="p-4 space-y-4 overflow-y-auto flex-1">
                        <div>
                            <select
                                value={configId || ''}
                                onChange={(e) => setConfigId(Number(e.target.value))}
                                className="w-full px-3 py-2 border-b border-gray-200 focus:outline-none focus:border-brand-500 transition-colors bg-transparent"
                                required
                            >
                                {accounts.map(account => (
                                    <option key={account.id} value={account.id}>
                                        {account.accountName}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <input
                                type="email"
                                placeholder="宛先"
                                value={to}
                                onChange={(e) => setTo(e.target.value)}
                                className="w-full px-3 py-2 border-b border-gray-200 focus:outline-none focus:border-brand-500 transition-colors"
                                required
                                list="contacts-list"
                            />
                            <datalist id="contacts-list">
                                {contacts.map(c => (
                                    <option key={c.email} value={c.email}>{c.name} &lt;{c.email}&gt;</option>
                                ))}
                            </datalist>
                        </div>
                        <div>
                            <input
                                type="text"
                                placeholder="件名"
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                className="w-full px-3 py-2 border-b border-gray-200 focus:outline-none focus:border-brand-500 transition-colors font-medium"
                                required
                            />
                        </div>
                        <div className="flex-1 min-h-[200px]">
                            <textarea
                                placeholder="本文を入力..."
                                value={body}
                                onChange={(e) => setBody(e.target.value)}
                                className="w-full h-full p-3 resize-none focus:outline-none"
                                required
                            />
                        </div>
                    </div>

                    <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors font-medium text-sm"
                        >
                            破棄
                        </button>
                        <button
                            type="submit"
                            disabled={isSending}
                            className="px-6 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-bold shadow-sm flex items-center gap-2"
                        >
                            {isSending ? (
                                <>
                                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    送信中...
                                </>
                            ) : (
                                <>
                                    送信
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                                    </svg>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
