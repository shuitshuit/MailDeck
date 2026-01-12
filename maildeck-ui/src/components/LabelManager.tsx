import { useState } from 'react';
import type { Label } from '../types/label';
import { createLabel, updateLabel, deleteLabel } from '../lib/api';
import LabelModal from './LabelModal';
import LabelBadge from './LabelBadge';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { useLabels } from '../contexts/LabelContext';

export default function LabelManager() {
    const { labels, isLoading, reloadLabels } = useLabels();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingLabel, setEditingLabel] = useState<Label | null>(null);
    const toast = useToast();
    const { confirm } = useConfirm();

    const handleCreateLabel = () => {
        setEditingLabel(null);
        setIsModalOpen(true);
    };

    const handleEditLabel = (label: Label) => {
        setEditingLabel(label);
        setIsModalOpen(true);
    };

    const handleSaveLabel = async (name: string, color: string) => {
        try {
            if (editingLabel) {
                // Update existing label
                await updateLabel(editingLabel.id, name, color);
            } else {
                // Create new label
                await createLabel(name, color);
            }
            await reloadLabels();
        } catch (error) {
            console.error('Failed to save label:', error);
            throw error; // Let modal handle the error
        }
    };

    const handleDeleteLabel = async (labelId: string) => {
        const confirmed = await confirm({
            title: 'ラベルを削除',
            message: 'このラベルを削除してもよろしいですか？\nラベルが付与されたメールからも削除されます。',
            type: 'danger',
            confirmText: '削除',
            cancelText: 'キャンセル'
        });

        if (!confirmed) {
            return;
        }

        try {
            await deleteLabel(labelId);
            await reloadLabels();
            toast.success('ラベルを削除しました');
        } catch (error) {
            console.error('Failed to delete label:', error);
            toast.error('ラベルの削除に失敗しました。');
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-gray-500">読み込み中...</div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-800">ラベル管理</h2>
                <button
                    onClick={handleCreateLabel}
                    className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors flex items-center gap-2"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    新しいラベル
                </button>
            </div>

            {labels.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    <p className="text-gray-500 mb-4">まだラベルがありません</p>
                    <button
                        onClick={handleCreateLabel}
                        className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
                    >
                        最初のラベルを作成
                    </button>
                </div>
            ) : (
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {labels.map(label => (
                        <div
                            key={label.id}
                            className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                        >
                            <div className="flex items-start justify-between mb-3">
                                <LabelBadge label={label} />
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => handleEditLabel(label)}
                                        className="p-1.5 text-gray-500 hover:text-brand-600 hover:bg-gray-100 rounded transition-colors"
                                        title="編集"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                        </svg>
                                    </button>
                                    <button
                                        onClick={() => handleDeleteLabel(label.id)}
                                        className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                        title="削除"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                            <div className="text-xs text-gray-500">
                                作成日: {new Date(label.createdAt).toLocaleDateString('ja-JP')}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Label Modal */}
            <LabelModal
                isOpen={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false);
                    setEditingLabel(null);
                }}
                onSave={handleSaveLabel}
                initialData={editingLabel ? { name: editingLabel.name, color: editingLabel.color } : null}
            />
        </div>
    );
}
