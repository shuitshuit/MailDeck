import { useEffect, useState } from 'react';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import type { AutoLabelingRule, AutoLabelingRuleWithLabel, RuleConditions } from '../types/autoLabeling';
import type { Label } from '../types/label';
import {
    getAutoLabelingRules,
    createAutoLabelingRule,
    updateAutoLabelingRule,
    deleteAutoLabelingRule,
    toggleAutoLabelingRule,
    getLabels
} from '../lib/api';
import AutoLabelingRuleCard from '../components/AutoLabelingRuleCard';
import AutoLabelingRuleModal from '../components/AutoLabelingRuleModal';

export default function AutoLabelingPage() {
    const [rules, setRules] = useState<AutoLabelingRuleWithLabel[]>([]);
    const [labels, setLabels] = useState<Label[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRule, setEditingRule] = useState<AutoLabelingRule | null>(null);
    const toast = useToast();
    const { confirm } = useConfirm();

    const fetchRules = async () => {
        try {
            const [rulesData, labelsData] = await Promise.all([
                getAutoLabelingRules(),
                getLabels()
            ]);

            // Join rules with labels to get label name and color
            const rulesWithLabels: AutoLabelingRuleWithLabel[] = rulesData.map((rule: AutoLabelingRule) => {
                const label = labelsData.find((l: Label) => l.id === rule.labelId);
                return {
                    ...rule,
                    labelName: label?.name,
                    labelColor: label?.color
                };
            });

            setRules(rulesWithLabels);
            setLabels(labelsData);
        } catch (error) {
            console.error('Failed to fetch rules:', error);
            toast.error('ルールの取得に失敗しました。');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRules();
    }, []);

    const handleSaveRule = async (ruleData: {
        ruleName: string;
        labelId: string;
        priority: number;
        isEnabled: boolean;
        conditions: RuleConditions;
    }) => {
        try {
            const conditionsJson = JSON.stringify(ruleData.conditions);

            if (editingRule) {
                // Update existing rule
                await updateAutoLabelingRule(editingRule.id, {
                    ...ruleData,
                    conditions: conditionsJson
                });
                toast.success('ルールを更新しました。');
            } else {
                // Create new rule
                await createAutoLabelingRule({
                    ruleName: ruleData.ruleName,
                    labelId: ruleData.labelId,
                    priority: ruleData.priority,
                    conditions: conditionsJson
                });
                toast.success('ルールを作成しました。');
            }

            setEditingRule(null);
            await fetchRules();
        } catch (error) {
            console.error('Failed to save rule:', error);
            throw error; // Re-throw to let modal handle the error
        }
    };

    const handleCreateRule = () => {
        if (labels.length === 0) {
            toast.error('ラベルが存在しません。先にラベルを作成してください。');
            return;
        }
        setEditingRule(null);
        setIsModalOpen(true);
    };

    const handleEditRule = (rule: AutoLabelingRuleWithLabel) => {
        setEditingRule(rule);
        setIsModalOpen(true);
    };

    const handleDeleteRule = async (ruleId: string) => {
        const confirmed = await confirm({
            title: 'ルールを削除',
            message: 'このルールを削除してもよろしいですか？この操作は取り消せません。',
            confirmText: '削除',
            cancelText: 'キャンセル'
        });

        if (!confirmed) return;

        try {
            await deleteAutoLabelingRule(ruleId);
            toast.success('ルールを削除しました。');
            await fetchRules();
        } catch (error) {
            console.error('Failed to delete rule:', error);
            toast.error('ルールの削除に失敗しました。');
        }
    };

    const handleToggleRule = async (ruleId: string) => {
        try {
            await toggleAutoLabelingRule(ruleId);
            toast.success('ルールの状態を変更しました。');
            await fetchRules();
        } catch (error) {
            console.error('Failed to toggle rule:', error);
            toast.error('ルールの状態変更に失敗しました。');
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
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">自動ラベリングルール</h1>
                        <p className="text-sm text-gray-600 mt-1">
                            新着メールに自動的にラベルを付与するルールを管理します。
                        </p>
                    </div>
                    <button
                        onClick={handleCreateRule}
                        className="flex items-center space-x-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-medium transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span>新規ルール作成</span>
                    </button>
                </div>

                {/* Info Box */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                    <div className="flex items-start space-x-3">
                        <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className="text-sm text-blue-800">
                            <p className="font-medium mb-1">自動ラベリングの仕組み</p>
                            <ul className="list-disc list-inside space-y-1 text-blue-700">
                                <li>新着メールを受信すると、有効なルールが優先度順に評価されます。</li>
                                <li>条件にマッチしたメールに、指定されたラベルが自動的に付与されます。</li>
                                <li>複数のルールがマッチした場合、すべてのラベルが付与されます。</li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Rules List */}
                {rules.length === 0 ? (
                    <div className="bg-white rounded-lg shadow-md p-12 text-center">
                        <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        <p className="text-gray-600 mb-4">まだルールが作成されていません。</p>
                        <button
                            onClick={handleCreateRule}
                            className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-medium transition-colors"
                        >
                            最初のルールを作成
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {rules.map(rule => (
                            <AutoLabelingRuleCard
                                key={rule.id}
                                rule={rule}
                                onEdit={handleEditRule}
                                onDelete={handleDeleteRule}
                                onToggle={handleToggleRule}
                            />
                        ))}
                    </div>
                )}

                {/* Label Warning */}
                {labels.length === 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-6">
                        <div className="flex items-start space-x-3">
                            <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <div className="text-sm text-yellow-800">
                                <p className="font-medium">ラベルが存在しません</p>
                                <p className="text-yellow-700 mt-1">
                                    自動ラベリングルールを作成するには、先にラベルを作成してください。
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal */}
            <AutoLabelingRuleModal
                isOpen={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false);
                    setEditingRule(null);
                }}
                onSave={handleSaveRule}
                labels={labels}
                initialData={editingRule}
            />
        </div>
    );
}
