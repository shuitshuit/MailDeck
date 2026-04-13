import { useEffect, useState } from 'react';
import { getContacts } from '../lib/api';
import { useModalClose } from '../hooks/useModalClose';
import { useToast } from '../contexts/ToastContext';

export interface Account {
    id: string;
    accountName: string;
}

interface ComposeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSend: (to: string, subject: string, body: string, configId: string) => Promise<void>;
    accounts: Account[];
    initialTo?: string;
}

export default function ComposeModal({ isOpen, onClose, onSend, accounts, initialTo = '' }: ComposeModalProps) {
    const [to, setTo] = useState(initialTo);
    // Initialize with the first account ID if available
    const [configId, setConfigId] = useState<string | undefined>(undefined);
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [contacts, setContacts] = useState<{ name: string, email: string }[]>([]);
    const { modalContentRef, handleBackdropClick } = useModalClose(isOpen, onClose);
    const toast = useToast();

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
            toast.warning('アカウントを選択してください');
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
            toast.error('送信に失敗しました。');
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={handleBackdropClick}>
            <div ref={modalContentRef} className="bg-white rounded-t-2xl md:rounded-xl shadow-xl w-full max-w-2xl relative z-10 flex flex-col h-[92dvh] md:h-auto md:max-h-[90vh]">
                <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
                    <h2 className="text-base font-bold text-gray-800">新規メール作成</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100 min-w-[44px] min-h-[44px] flex items-center justify-center"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
                    <div className="px-4 py-3 space-y-1 overflow-y-auto flex-1">
                        <div>
                            <select
                                value={configId || ''}
                                onChange={(e) => setConfigId(e.target.value)}
                                className="w-full px-3 py-3 border-b border-gray-200 focus:outline-none focus:border-brand-500 transition-colors bg-transparent text-base"
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
                                className="w-full px-3 py-3 border-b border-gray-200 focus:outline-none focus:border-brand-500 transition-colors text-base"
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
                                className="w-full px-3 py-3 border-b border-gray-200 focus:outline-none focus:border-brand-500 transition-colors font-medium text-base"
                                required
                            />
                        </div>
                        <div className="flex-1 min-h-[160px]">
                            <textarea
                                placeholder="本文を入力..."
                                value={body}
                                onChange={(e) => setBody(e.target.value)}
                                className="w-full h-full p-3 resize-none focus:outline-none text-base"
                                required
                            />
                        </div>
                    </div>

                    <div className="px-4 py-3 border-t bg-gray-50 flex gap-3 shrink-0">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors font-medium text-sm border border-gray-300"
                        >
                            破棄
                        </button>
                        <button
                            type="submit"
                            disabled={isSending}
                            className="flex-1 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-bold shadow-sm flex items-center justify-center gap-2"
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
