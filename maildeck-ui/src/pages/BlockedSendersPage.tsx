import { useEffect, useState } from 'react';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import type { BlockedSender } from '../types/blockedSenders';
import {
    getBlockedSenders,
    createBlockedSender,
    updateBlockedSender,
    deleteBlockedSender,
    toggleBlockedSender
} from '../lib/api';
import BlockedSenderModal from '../components/BlockedSenderModal';

export default function BlockedSendersPage() {
    const [senders, setSenders] = useState<BlockedSender[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSender, setEditingSender] = useState<BlockedSender | null>(null);
    const toast = useToast();
    const { confirm } = useConfirm();

    const fetchSenders = async () => {
        try {
            const data = await getBlockedSenders();
            setSenders(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Failed to fetch blocked senders:', error);
            toast.error('ブロックリストの取得に失敗しました。');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSenders();
    }, []);

    const handleOpenCreate = () => {
        setEditingSender(null);
        setIsModalOpen(true);
    };

    const handleOpenEdit = (sender: BlockedSender) => {
        setEditingSender(sender);
        setIsModalOpen(true);
    };

    const handleSave = async (data: { emailAddress: string; note?: string }) => {
        if (editingSender) {
            await updateBlockedSender(editingSender.id, {
                emailAddress: data.emailAddress,
                note: data.note,
                isEnabled: editingSender.isEnabled
            });
            toast.success('ブロック送信者を更新しました。');
        } else {
            await createBlockedSender(data);
            toast.success('送信者をブロックしました。');
        }
        await fetchSenders();
    };

    const handleToggle = async (sender: BlockedSender) => {
        try {
            await toggleBlockedSender(sender.id);
            await fetchSenders();
        } catch (error) {
            console.error('Failed to toggle blocked sender:', error);
            toast.error('状態の切り替えに失敗しました。');
        }
    };

    const handleDelete = async (sender: BlockedSender) => {
        const confirmed = await confirm({
            title: 'ブロック解除',
            message: `${sender.emailAddress} のブロックを解除しますか？`,
            confirmText: '解除',
            cancelText: 'キャンセル',
            type: 'danger'
        });
        if (!confirmed) return;

        try {
            await deleteBlockedSender(sender.id);
            toast.success('ブロックを解除しました。');
            await fetchSenders();
        } catch (error) {
            console.error('Failed to delete blocked sender:', error);
            toast.error('削除に失敗しました。');
        }
    };

    return (
        <div className="p-4 md:p-6 max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">ブロック送信者</h1>
                    <p className="text-sm text-gray-500 mt-1">登録したアドレスからのメールは自動ラベリングより先にSpamフォルダへ移動されます。</p>
                </div>
                <button
                    onClick={handleOpenCreate}
                    className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors text-sm font-medium"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    追加
                </button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-16 text-gray-400">
                    <svg className="w-6 h-6 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    読み込み中...
                </div>
            ) : senders.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                    <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                    <p className="text-sm">ブロック中の送信者はいません</p>
                </div>
            ) : (
                <div className="bg-white rounded-xl border overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-gray-50 text-left">
                                <th className="px-4 py-3 font-medium text-gray-600">メールアドレス</th>
                                <th className="px-4 py-3 font-medium text-gray-600 hidden md:table-cell">メモ</th>
                                <th className="px-4 py-3 font-medium text-gray-600 text-center">状態</th>
                                <th className="px-4 py-3 font-medium text-gray-600 text-right">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {senders.map((sender) => (
                                <tr key={sender.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3 font-mono text-gray-800 break-all">{sender.emailAddress}</td>
                                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{sender.note || '—'}</td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                            sender.isEnabled
                                                ? 'bg-red-100 text-red-700'
                                                : 'bg-gray-100 text-gray-500'
                                        }`}>
                                            {sender.isEnabled ? 'ブロック中' : '無効'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => handleToggle(sender)}
                                                className="text-xs px-2 py-1 rounded border text-gray-600 hover:bg-gray-100 transition-colors"
                                                title={sender.isEnabled ? '無効にする' : '有効にする'}
                                            >
                                                {sender.isEnabled ? '無効化' : '有効化'}
                                            </button>
                                            <button
                                                onClick={() => handleOpenEdit(sender)}
                                                className="text-xs px-2 py-1 rounded border text-gray-600 hover:bg-gray-100 transition-colors"
                                            >
                                                編集
                                            </button>
                                            <button
                                                onClick={() => handleDelete(sender)}
                                                className="text-xs px-2 py-1 rounded border text-red-600 hover:bg-red-50 transition-colors"
                                            >
                                                削除
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <BlockedSenderModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSave}
                initialData={editingSender}
            />
        </div>
    );
}
