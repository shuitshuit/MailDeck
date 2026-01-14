import { useEffect, useState } from 'react';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import type { CustomActionPattern } from '../types/customAction';
import {
    getCustomActionPatterns,
    createCustomActionPattern,
    updateCustomActionPattern,
    deleteCustomActionPattern,
    toggleCustomActionPattern
} from '../lib/api';
import CustomActionPatternCard from '../components/CustomActionPatternCard';
import CustomActionPatternModal from '../components/CustomActionPatternModal';

export default function CustomActionsPage() {
    const [patterns, setPatterns] = useState<CustomActionPattern[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPattern, setEditingPattern] = useState<CustomActionPattern | null>(null);
    const toast = useToast();
    const { confirm } = useConfirm();

    const fetchPatterns = async () => {
        try {
            const data = await getCustomActionPatterns();

            if (!Array.isArray(data)) {
                throw new Error('Invalid data format received from server');
            }

            setPatterns(data);
        } catch (error) {
            console.error('Failed to fetch patterns:', error);
            toast.error('パターンの取得に失敗しました。');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPatterns();
    }, []);

    const handleSavePattern = async (patternData: {
        patternName: string;
        patternType: string;
        regexPattern: string;
        actionType: string;
        priority: number;
        isEnabled: boolean;
        description?: string;
    }) => {
        try {
            if (editingPattern) {
                // Update existing pattern
                await updateCustomActionPattern(editingPattern.id, patternData);
                toast.success('パターンを更新しました。');
            } else {
                // Create new pattern
                await createCustomActionPattern({
                    patternName: patternData.patternName,
                    patternType: patternData.patternType,
                    regexPattern: patternData.regexPattern,
                    actionType: patternData.actionType,
                    priority: patternData.priority,
                    description: patternData.description
                });
                toast.success('パターンを作成しました。');
            }

            setEditingPattern(null);
            await fetchPatterns();
        } catch (error) {
            console.error('Failed to save pattern:', error);
            throw error; // Re-throw to let modal handle the error
        }
    };

    const handleCreatePattern = () => {
        setEditingPattern(null);
        setIsModalOpen(true);
    };

    const handleEditPattern = (pattern: CustomActionPattern) => {
        setEditingPattern(pattern);
        setIsModalOpen(true);
    };

    const handleDeletePattern = async (patternId: string) => {
        const confirmed = await confirm({
            title: 'パターンを削除',
            message: 'このパターンを削除してもよろしいですか？この操作は取り消せません。',
            confirmText: '削除',
            cancelText: 'キャンセル'
        });

        if (!confirmed) return;

        try {
            await deleteCustomActionPattern(patternId);
            toast.success('パターンを削除しました。');
            await fetchPatterns();
        } catch (error) {
            console.error('Failed to delete pattern:', error);
            toast.error('パターンの削除に失敗しました。');
        }
    };

    const handleTogglePattern = async (patternId: string) => {
        try {
            await toggleCustomActionPattern(patternId);
            toast.success('パターンの状態を変更しました。');
            await fetchPatterns();
        } catch (error) {
            console.error('Failed to toggle pattern:', error);
            toast.error('パターンの状態変更に失敗しました。');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-gray-600">読み込み中...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-800 mb-2">
                                カスタムアクション
                            </h1>
                            <p className="text-gray-600">
                                メール本文中の特定のパターン（OTPコード、追跡番号など）を検出し、
                                コピーボタンを表示します。
                            </p>
                        </div>
                        <button
                            onClick={handleCreatePattern}
                            className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-medium transition-colors flex items-center space-x-2"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            <span>新規パターン</span>
                        </button>
                    </div>
                </div>

                {/* Info Box */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                    <div className="flex items-start space-x-3">
                        <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className="flex-1">
                            <h3 className="text-sm font-semibold text-blue-900 mb-1">
                                セキュリティとプライバシー
                            </h3>
                            <p className="text-sm text-blue-800">
                                パターンマッチングはお使いのブラウザ内でのみ実行されます。
                                検出された値（OTPコードなど）がサーバーに送信されることはありません。
                            </p>
                        </div>
                    </div>
                </div>

                {/* Patterns List */}
                {patterns.length === 0 ? (
                    <div className="bg-white rounded-xl shadow-sm p-12 text-center">
                        <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        <h3 className="text-lg font-semibold text-gray-800 mb-2">
                            パターンがありません
                        </h3>
                        <p className="text-gray-600 mb-4">
                            新しいパターンを作成して、メール本文から自動的に情報を抽出しましょう。
                        </p>
                        <button
                            onClick={handleCreatePattern}
                            className="px-6 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-medium transition-colors"
                        >
                            最初のパターンを作成
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {patterns.map(pattern => (
                            <CustomActionPatternCard
                                key={pattern.id}
                                pattern={pattern}
                                onEdit={handleEditPattern}
                                onDelete={handleDeletePattern}
                                onToggle={handleTogglePattern}
                            />
                        ))}
                    </div>
                )}

                {/* Pattern Modal */}
                <CustomActionPatternModal
                    isOpen={isModalOpen}
                    onClose={() => {
                        setIsModalOpen(false);
                        setEditingPattern(null);
                    }}
                    onSave={handleSavePattern}
                    initialData={editingPattern}
                />
            </div>
        </div>
    );
}
