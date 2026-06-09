import { useEffect, useState } from 'react';
import { useModalClose } from '../hooks/useModalClose';
import { useToast } from '../contexts/ToastContext';
import type { BlockedSender } from '../types/blockedSenders';

interface BlockedSenderModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: { emailAddress: string; note?: string }) => Promise<void>;
    initialData?: BlockedSender | null;
}

export default function BlockedSenderModal({ isOpen, onClose, onSave, initialData }: BlockedSenderModalProps) {
    const [emailAddress, setEmailAddress] = useState('');
    const [note, setNote] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const { modalContentRef, handleBackdropClick } = useModalClose(isOpen, onClose);
    const toast = useToast();

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setEmailAddress(initialData.emailAddress);
                setNote(initialData.note ?? '');
            } else {
                setEmailAddress('');
                setNote('');
            }
        }
    }, [isOpen, initialData]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await onSave({ emailAddress: emailAddress.trim(), note: note.trim() || undefined });
            onClose();
        } catch (error) {
            console.error('Failed to save blocked sender:', error);
            toast.error('保存に失敗しました。');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={handleBackdropClick}>
            <div ref={modalContentRef} className="bg-white rounded-t-2xl md:rounded-xl shadow-xl w-full max-w-md relative z-10 flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
                    <h2 className="text-base font-bold text-gray-800">{initialData ? 'ブロック送信者を編集' : '送信者をブロック'}</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col">
                    <div className="p-4 space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス <span className="text-red-500">*</span></label>
                            <input
                                type="email"
                                value={emailAddress}
                                onChange={(e) => setEmailAddress(e.target.value)}
                                className="w-full px-3 py-3 text-base border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
                                placeholder="spam@example.com"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">メモ（任意）</label>
                            <textarea
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                className="w-full px-3 py-3 text-base border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all resize-none"
                                placeholder="ブロック理由など"
                                rows={2}
                            />
                        </div>
                    </div>

                    <div className="px-4 py-3 flex gap-3 border-t bg-gray-50 shrink-0">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium transition-colors border border-gray-300"
                        >
                            キャンセル
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving || !emailAddress.trim()}
                            className="flex-1 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors font-medium"
                        >
                            {isSaving ? '保存中...' : '保存'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
