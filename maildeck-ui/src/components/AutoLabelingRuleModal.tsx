import { useEffect, useState } from 'react';
import { useModalClose } from '../hooks/useModalClose';
import { useToast } from '../contexts/ToastContext';
import type { AutoLabelingRule, RuleConditions } from '../types/autoLabeling';
import type { Label } from '../types/label';
import RuleConditionBuilder from './RuleConditionBuilder';

interface AutoLabelingRuleModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (rule: {
        ruleName: string;
        labelId: string;
        priority: number;
        isEnabled: boolean;
        conditions: RuleConditions;
    }) => Promise<void>;
    labels: Label[];
    initialData?: AutoLabelingRule | null;
}

export default function AutoLabelingRuleModal({
    isOpen,
    onClose,
    onSave,
    labels,
    initialData
}: AutoLabelingRuleModalProps) {
    const [ruleName, setRuleName] = useState('');
    const [labelId, setLabelId] = useState('');
    const [priority, setPriority] = useState(0);
    const [isEnabled, setIsEnabled] = useState(true);
    const [conditions, setConditions] = useState<RuleConditions>({
        rules: [{ field: 'from', operator: 'contains', value: '' }]
    });
    const [isSaving, setIsSaving] = useState(false);
    const { modalContentRef, handleBackdropClick } = useModalClose(isOpen, onClose);
    const toast = useToast();

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setRuleName(initialData.ruleName);
                setLabelId(initialData.labelId);
                setPriority(initialData.priority);
                setIsEnabled(initialData.isEnabled);

                // Migrate old format to new format if needed
                const migratedConditions = { ...initialData.conditions };
                if (migratedConditions.rules && migratedConditions.rules.length > 1) {
                    // Ensure each condition (except the last) has a nextOperator
                    for (let i = 0; i < migratedConditions.rules.length - 1; i++) {
                        if (!migratedConditions.rules[i].nextOperator) {
                            // Use the old global operator if available, otherwise default to AND
                            migratedConditions.rules[i].nextOperator = (initialData.conditions as any).operator || 'AND';
                        }
                    }
                }
                setConditions(migratedConditions);
            } else {
                setRuleName('');
                setLabelId(labels.length > 0 ? labels[0].id : '');
                setPriority(0);
                setIsEnabled(true);
                setConditions({
                    rules: [{ field: 'from', operator: 'contains', value: '' }]
                });
            }
        }
    }, [isOpen, initialData, labels]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validation
        if (!ruleName.trim()) {
            toast.error('ルール名を入力してください。');
            return;
        }

        if (!labelId) {
            toast.error('ラベルを選択してください。');
            return;
        }

        if (conditions.rules.length === 0) {
            toast.error('少なくとも1つの条件を追加してください。');
            return;
        }

        // Check if all conditions have values
        const hasEmptyValue = conditions.rules.some(rule => !rule.value.trim());
        if (hasEmptyValue) {
            toast.error('すべての条件に値を入力してください。');
            return;
        }

        setIsSaving(true);
        try {
            await onSave({
                ruleName,
                labelId,
                priority,
                isEnabled,
                conditions
            });
            onClose();
        } catch (error) {
            console.error('Failed to save rule:', error);
            toast.error('ルールの保存に失敗しました。');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={handleBackdropClick}>
            <div
                ref={modalContentRef}
                className="bg-white rounded-t-2xl md:rounded-xl shadow-xl w-full max-w-2xl relative z-10 flex flex-col max-h-[92dvh] md:max-h-[90vh]"
            >
                <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
                    <h2 className="text-base font-bold text-gray-800">
                        {initialData ? '自動ラベリングルールを編集' : '自動ラベリングルールを作成'}
                    </h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
                <div className="p-4 space-y-4 overflow-y-auto flex-1">
                    {/* Rule Name */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            ルール名 <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={ruleName}
                            onChange={(e) => setRuleName(e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
                            placeholder="例: 重要メールを仕事ラベルへ"
                            required
                        />
                    </div>

                    {/* Label Selection */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            適用するラベル <span className="text-red-500">*</span>
                        </label>
                        <select
                            value={labelId}
                            onChange={(e) => setLabelId(e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white"
                            required
                        >
                            {labels.map(label => (
                                <option key={label.id} value={label.id}>
                                    {label.name}
                                </option>
                            ))}
                        </select>
                        {labels.length === 0 && (
                            <p className="text-sm text-red-600 mt-1">
                                ラベルが存在しません。先にラベルを作成してください。
                            </p>
                        )}
                    </div>

                    {/* Priority */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            優先度 (高い数値ほど優先)
                        </label>
                        <input
                            type="number"
                            value={priority}
                            onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                            min="0"
                            max="999"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            複数のルールがマッチした場合、優先度の高いルールが適用されます。
                        </p>
                    </div>

                    {/* Enabled Toggle */}
                    {initialData && (
                        <div className="flex items-center space-x-3">
                            <input
                                type="checkbox"
                                id="isEnabled"
                                checked={isEnabled}
                                onChange={(e) => setIsEnabled(e.target.checked)}
                                className="w-4 h-4 text-brand-600 border-gray-300 rounded focus:ring-brand-500"
                            />
                            <label htmlFor="isEnabled" className="text-sm font-medium text-gray-700">
                                ルールを有効にする
                            </label>
                        </div>
                    )}

                    {/* Conditions */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                            条件 <span className="text-red-500">*</span>
                        </label>
                        <RuleConditionBuilder
                            conditions={conditions}
                            onChange={setConditions}
                        />
                    </div>

                </div>
                    {/* Actions */}
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
                            disabled={isSaving || labels.length === 0}
                            className="flex-1 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSaving ? '保存中...' : initialData ? '更新' : '作成'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
