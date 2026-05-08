import { useEffect, useRef, useState } from 'react';
import { getContacts } from '../lib/api';
import { useModalClose } from '../hooks/useModalClose';
import { useToast } from '../contexts/ToastContext';
import EmailChipInput from './EmailChipInput';

export interface Account {
    id: string;
    accountName: string;
}

interface ComposeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSend: (to: string, subject: string, body: string, configId: string, cc?: string, bcc?: string, replyTo?: string, attachments?: File[]) => Promise<void>;
    accounts: Account[];
    initialTo?: string;
    initialSubject?: string;
    initialBody?: string;
    initialConfigId?: string;
    initialReplyTo?: string;
    mode?: 'compose' | 'reply' | 'forward';
}

export default function ComposeModal({ isOpen, onClose, onSend, accounts, initialTo = '', initialSubject = '', initialBody = '', initialConfigId, initialReplyTo = '', mode = 'compose' }: ComposeModalProps) {
    const [toChips, setToChips] = useState<string[]>(initialTo ? [initialTo] : []);
    // Initialize with the first account ID if available
    const [configId, setConfigId] = useState<string | undefined>(undefined);
    const [ccChips, setCcChips] = useState<string[]>([]);
    const [bccChips, setBccChips] = useState<string[]>([]);
    const [replyTo, setReplyTo] = useState(initialReplyTo);
    const [subject, setSubject] = useState(initialSubject);
    const [body, setBody] = useState(initialBody);
    const [isSending, setIsSending] = useState(false);
    const [attachments, setAttachments] = useState<File[]>([]);
    const [isDragOver, setIsDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [contacts, setContacts] = useState<{ name: string, email: string }[]>([]);
    const { modalContentRef, handleBackdropClick } = useModalClose(isOpen, onClose);
    const toast = useToast();

    useEffect(() => {
        getContacts().then(setContacts).catch(console.error);
    }, []);

    useEffect(() => {
        if (isOpen) {
            setToChips(initialTo ? [initialTo] : []);
            setCcChips([]);
            setBccChips([]);
            setReplyTo(initialReplyTo);
            setSubject(initialSubject);
            setBody(initialBody);
            setAttachments([]);
            if (initialConfigId) {
                setConfigId(initialConfigId);
            } else if (accounts.length > 0) {
                const isValid = configId !== undefined && accounts.some(a => a.id === configId);
                if (!isValid) {
                    setConfigId(accounts[0].id);
                }
            }
        }
    }, [isOpen, initialTo, initialSubject, initialBody, initialConfigId, initialReplyTo, accounts, configId]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (configId === undefined) {
            toast.warning('アカウントを選択してください');
            return;
        }
        if (toChips.length === 0) {
            toast.warning('宛先を入力してください');
            return;
        }
        setIsSending(true);
        try {
            await onSend(
                toChips.join(', '),
                subject,
                body,
                configId,
                ccChips.length > 0 ? ccChips.join(', ') : undefined,
                bccChips.length > 0 ? bccChips.join(', ') : undefined,
                replyTo || undefined,
                attachments.length > 0 ? attachments : undefined
            );
            // Reset form
            setToChips([]);
            setCcChips([]);
            setBccChips([]);
            setReplyTo('');
            setSubject('');
            setBody('');
            setAttachments([]);
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
                    <h2 className="text-base font-bold text-gray-800">
                        {mode === 'reply' ? '返信' : mode === 'forward' ? '転送' : '新規メール作成'}
                    </h2>
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
                                className="w-full px-3 py-3 border-b border-gray-200 focus:outline-none focus:border-brand-500 transition-colors bg-transparent text-base disabled:opacity-60 disabled:cursor-not-allowed"
                                required
                                disabled={!!initialConfigId && mode !== 'forward'}
                            >
                                {accounts.map(account => (
                                    <option key={account.id} value={account.id}>
                                        {account.accountName}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <EmailChipInput
                            label="To"
                            chips={toChips}
                            onChange={setToChips}
                            contacts={contacts}
                            required
                        />
                        <EmailChipInput
                            label="Cc"
                            chips={ccChips}
                            onChange={setCcChips}
                            contacts={contacts}
                        />
                        <EmailChipInput
                            label="Bcc"
                            chips={bccChips}
                            onChange={setBccChips}
                            contacts={contacts}
                        />
                        {mode !== 'forward' && (
                            <div>
                                <input
                                    type="email"
                                    placeholder="返信先 (Reply-To)"
                                    value={replyTo}
                                    onChange={(e) => setReplyTo(e.target.value)}
                                    className="w-full px-3 py-3 border-b border-gray-200 focus:outline-none focus:border-brand-500 transition-colors text-base"
                                    disabled={!!initialConfigId}
                                />
                            </div>
                        )}
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
                        <div className="min-h-[160px]">
                            <textarea
                                placeholder="本文を入力..."
                                value={body}
                                onChange={(e) => setBody(e.target.value)}
                                className="w-full p-3 resize-y focus:outline-none text-base min-h-[160px]"
                                required
                            />
                        </div>

                        {/* ファイル添付エリア */}
                        <div
                            className={`mx-1 border-2 border-dashed rounded-lg p-3 text-center transition-colors cursor-pointer ${
                                isDragOver ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-400'
                            }`}
                            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                            onDragLeave={() => setIsDragOver(false)}
                            onDrop={(e) => {
                                e.preventDefault();
                                setIsDragOver(false);
                                const files = Array.from(e.dataTransfer.files);
                                setAttachments(prev => [...prev, ...files]);
                            }}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                className="hidden"
                                onChange={(e) => {
                                    const files = Array.from(e.target.files ?? []);
                                    setAttachments(prev => [...prev, ...files]);
                                    e.target.value = '';
                                }}
                            />
                            <p className="text-sm text-gray-500">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 inline mr-1 mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                </svg>
                                ファイルをドラッグ&ドロップ、またはクリックして選択
                            </p>
                        </div>

                        {/* 添付ファイルリスト */}
                        {attachments.length > 0 && (
                            <ul className="mx-1 space-y-1">
                                {attachments.map((file, i) => (
                                    <li key={i} className="flex items-center justify-between bg-gray-100 rounded px-3 py-1.5 text-sm">
                                        <span className="truncate flex-1">{file.name}</span>
                                        <span className="text-gray-400 ml-2 shrink-0 text-xs">
                                            {file.size < 1024 * 1024
                                                ? `${(file.size / 1024).toFixed(0)}KB`
                                                : `${(file.size / 1024 / 1024).toFixed(1)}MB`}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                                            className="ml-2 text-red-500 hover:text-red-700 shrink-0 min-w-[24px] min-h-[24px] flex items-center justify-center"
                                            title="削除"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
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
