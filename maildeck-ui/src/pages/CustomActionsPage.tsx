import { useEffect, useState } from 'react';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import type { CustomActionPattern, SystemPresetPattern, PatternUsageStats } from '../types/customAction';
import {
    getCustomActionPatterns,
    createCustomActionPattern,
    updateCustomActionPattern,
    deleteCustomActionPattern,
    toggleCustomActionPattern,
    getSystemPresetPatterns,
    getPresetCategories,
    importMultiplePresetPatterns,
    getPatternUsageStats
} from '../lib/api';
import CustomActionPatternCard from '../components/CustomActionPatternCard';
import CustomActionPatternModal from '../components/CustomActionPatternModal';

export default function CustomActionsPage() {
    const [patterns, setPatterns] = useState<CustomActionPattern[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPattern, setEditingPattern] = useState<CustomActionPattern | null>(null);

    // Preset patterns
    const [presets, setPresets] = useState<SystemPresetPattern[]>([]);
    const [presetCategories, setPresetCategories] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [selectedPresets, setSelectedPresets] = useState<Set<string>>(new Set());
    const [showPresets, setShowPresets] = useState(false);
    const [importingPresets, setImportingPresets] = useState(false);

    // Usage statistics
    const [stats, setStats] = useState<PatternUsageStats | null>(null);
    const [showStats, setShowStats] = useState(false);

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

    const fetchPresets = async () => {
        try {
            const [presetsData, categoriesData] = await Promise.all([
                getSystemPresetPatterns(selectedCategory || undefined),
                getPresetCategories()
            ]);
            setPresets(presetsData);
            setPresetCategories(categoriesData);
        } catch (error) {
            console.error('Failed to fetch presets:', error);
            toast.error('プリセットパターンの取得に失敗しました。');
        }
    };

    const fetchStats = async () => {
        try {
            const data = await getPatternUsageStats(30);
            setStats(data);
        } catch (error) {
            console.error('Failed to fetch stats:', error);
            toast.error('統計データの取得に失敗しました。');
        }
    };

    useEffect(() => {
        if (showPresets) {
            fetchPresets();
        }
    }, [showPresets, selectedCategory]);

    useEffect(() => {
        if (showStats) {
            fetchStats();
        }
    }, [showStats]);

    const handleSavePattern = async (patternData: {
        patternName: string;
        patternType: string;
        regexPattern: string;
        actionType: string;
        priority: number;
        isEnabled: boolean;
        description?: string;
        linkTemplate?: string;
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
                    description: patternData.description,
                    linkTemplate: patternData.linkTemplate
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

    const handleImportPresets = async () => {
        if (selectedPresets.size === 0) {
            toast.error('インポートするプリセットを選択してください。');
            return;
        }

        setImportingPresets(true);
        try {
            const result = await importMultiplePresetPatterns(Array.from(selectedPresets));

            if (result.importedCount > 0) {
                toast.success(`${result.importedCount}件のプリセットをインポートしました。`);
            }

            if (result.skippedCount > 0) {
                toast.info(`${result.skippedCount}件はスキップされました: ${result.skipped.join(', ')}`);
            }

            setSelectedPresets(new Set());
            await fetchPatterns();
        } catch (error) {
            console.error('Failed to import presets:', error);
            toast.error('プリセットのインポートに失敗しました。');
        } finally {
            setImportingPresets(false);
        }
    };

    const togglePresetSelection = (presetId: string) => {
        setSelectedPresets(prev => {
            const newSet = new Set(prev);
            if (newSet.has(presetId)) {
                newSet.delete(presetId);
            } else {
                newSet.add(presetId);
            }
            return newSet;
        });
    };

    const selectAllPresets = () => {
        setSelectedPresets(new Set(presets.map(p => p.id)));
    };

    const deselectAllPresets = () => {
        setSelectedPresets(new Set());
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

                {/* Quick Actions */}
                <div className="flex space-x-4 mb-6">
                    <button
                        onClick={() => setShowPresets(!showPresets)}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2 ${
                            showPresets
                                ? 'bg-indigo-100 text-indigo-700'
                                : 'bg-white text-gray-700 hover:bg-gray-50 border'
                        }`}
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        <span>プリセットからインポート</span>
                    </button>

                    <button
                        onClick={() => setShowStats(!showStats)}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2 ${
                            showStats
                                ? 'bg-green-100 text-green-700'
                                : 'bg-white text-gray-700 hover:bg-gray-50 border'
                        }`}
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        <span>使用統計</span>
                    </button>
                </div>

                {/* Preset Import Section */}
                {showPresets && (
                    <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-gray-800">プリセットパターン</h2>
                            <div className="flex items-center space-x-2">
                                <select
                                    value={selectedCategory}
                                    onChange={(e) => setSelectedCategory(e.target.value)}
                                    className="px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white"
                                >
                                    <option value="">すべてのカテゴリ</option>
                                    {presetCategories.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {presets.length === 0 ? (
                            <p className="text-gray-500 text-center py-8">プリセットがありません</p>
                        ) : (
                            <>
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex space-x-2">
                                        <button
                                            onClick={selectAllPresets}
                                            className="text-sm text-brand-600 hover:text-brand-700"
                                        >
                                            すべて選択
                                        </button>
                                        <span className="text-gray-300">|</span>
                                        <button
                                            onClick={deselectAllPresets}
                                            className="text-sm text-gray-600 hover:text-gray-700"
                                        >
                                            選択解除
                                        </button>
                                    </div>
                                    <span className="text-sm text-gray-500">
                                        {selectedPresets.size}件選択中
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto">
                                    {presets.map(preset => (
                                        <label
                                            key={preset.id}
                                            className={`flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                                selectedPresets.has(preset.id)
                                                    ? 'bg-brand-50 border-brand-300'
                                                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                                            }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedPresets.has(preset.id)}
                                                onChange={() => togglePresetSelection(preset.id)}
                                                className="mt-1 w-4 h-4 text-brand-600 border-gray-300 rounded focus:ring-brand-500"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center space-x-2">
                                                    <span className="font-medium text-gray-800 truncate">
                                                        {preset.patternName}
                                                    </span>
                                                    {preset.isRecommended && (
                                                        <span className="px-1.5 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded">
                                                            おすすめ
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-gray-500 truncate mt-0.5">
                                                    {preset.description || preset.regexPattern}
                                                </p>
                                                <div className="flex items-center space-x-2 mt-1">
                                                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                                                        preset.actionType === 'link'
                                                            ? 'bg-indigo-100 text-indigo-700'
                                                            : preset.actionType === 'highlight'
                                                            ? 'bg-amber-100 text-amber-700'
                                                            : 'bg-blue-100 text-blue-700'
                                                    }`}>
                                                        {preset.actionType === 'link' ? 'リンク' : preset.actionType === 'highlight' ? 'ハイライト' : 'コピー'}
                                                    </span>
                                                    {preset.category && (
                                                        <span className="text-xs text-gray-400">
                                                            {preset.category}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </label>
                                    ))}
                                </div>

                                <div className="mt-4 flex justify-end">
                                    <button
                                        onClick={handleImportPresets}
                                        disabled={selectedPresets.size === 0 || importingPresets}
                                        className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                                    >
                                        {importingPresets ? (
                                            <>
                                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                <span>インポート中...</span>
                                            </>
                                        ) : (
                                            <>
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                                </svg>
                                                <span>{selectedPresets.size}件をインポート</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* Stats Section */}
                {showStats && stats && (
                    <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
                        <h2 className="text-lg font-semibold text-gray-800 mb-4">使用統計 (過去30日間)</h2>

                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                            <div className="bg-blue-50 rounded-lg p-4 text-center">
                                <div className="text-2xl font-bold text-blue-700">{stats.totalUsage}</div>
                                <div className="text-sm text-blue-600">総使用回数</div>
                            </div>
                            <div className="bg-green-50 rounded-lg p-4 text-center">
                                <div className="text-2xl font-bold text-green-700">{stats.actionStats.copy}</div>
                                <div className="text-sm text-green-600">コピー</div>
                            </div>
                            <div className="bg-indigo-50 rounded-lg p-4 text-center">
                                <div className="text-2xl font-bold text-indigo-700">{stats.actionStats.linkClick}</div>
                                <div className="text-sm text-indigo-600">リンククリック</div>
                            </div>
                            <div className="bg-amber-50 rounded-lg p-4 text-center">
                                <div className="text-2xl font-bold text-amber-700">{stats.actionStats.highlightCopy}</div>
                                <div className="text-sm text-amber-600">ハイライトコピー</div>
                            </div>
                        </div>

                        {/* Pattern Usage Ranking */}
                        {stats.patternStats.length > 0 && (
                            <div>
                                <h3 className="text-sm font-semibold text-gray-700 mb-3">パターン別使用回数</h3>
                                <div className="space-y-2">
                                    {stats.patternStats.slice(0, 5).map((ps, index) => (
                                        <div key={ps.patternId} className="flex items-center space-x-3">
                                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium ${
                                                index === 0 ? 'bg-yellow-100 text-yellow-700' :
                                                index === 1 ? 'bg-gray-200 text-gray-700' :
                                                index === 2 ? 'bg-orange-100 text-orange-700' :
                                                'bg-gray-100 text-gray-600'
                                            }`}>
                                                {index + 1}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-medium text-gray-800 truncate">
                                                    {ps.patternName}
                                                </div>
                                            </div>
                                            <div className="text-sm font-semibold text-gray-700">
                                                {ps.totalUsage}回
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {stats.totalUsage === 0 && (
                            <p className="text-center text-gray-500 py-4">
                                まだ使用統計がありません。パターンを使用すると統計が表示されます。
                            </p>
                        )}
                    </div>
                )}

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
