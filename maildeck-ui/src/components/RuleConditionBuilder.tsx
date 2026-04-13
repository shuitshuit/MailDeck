import { useState, useEffect } from 'react';
import type { RuleCondition, RuleConditions } from '../types/autoLabeling';

interface RuleConditionBuilderProps {
    conditions: RuleConditions;
    onChange: (conditions: RuleConditions) => void;
}

export default function RuleConditionBuilder({ conditions, onChange }: RuleConditionBuilderProps) {
    const fieldOptions = [
        { value: 'from', label: '送信者 (From)' },
        { value: 'subject', label: '件名 (Subject)' },
        { value: 'body', label: '本文 (Body)' }
    ];

    const operatorOptions = [
        { value: 'contains', label: '含む (contains)' },
        { value: 'notcontains', label: '含まない (not contains)' },
        { value: 'equals', label: '一致する (equals)' },
        { value: 'notequals', label: '一致しない (not equals)' },
        { value: 'startswith', label: 'で始まる (starts with)' },
        { value: 'endswith', label: 'で終わる (ends with)' },
        { value: 'matches', label: '正規表現にマッチ (matches regex)' },
        { value: 'notmatches', label: '正規表現にマッチしない (not matches regex)' }
    ];

    const isRegexOperator = (op: string) => op === 'matches' || op === 'notmatches';

    const [regexErrors, setRegexErrors] = useState<Record<number, string | null>>({});

    useEffect(() => {
        const errors: Record<number, string | null> = {};
        conditions.rules.forEach((rule, idx) => {
            if (isRegexOperator(rule.operator) && rule.value) {
                try {
                    new RegExp(rule.value);
                    errors[idx] = null;
                } catch {
                    errors[idx] = '無効な正規表現です';
                }
            } else {
                errors[idx] = null;
            }
        });
        setRegexErrors(errors);
    }, [conditions.rules]);

    const handleAddCondition = () => {
        const newRules = [...conditions.rules];
        // Set the previous last condition's nextOperator if not set
        if (newRules.length > 0 && !newRules[newRules.length - 1].nextOperator) {
            newRules[newRules.length - 1].nextOperator = 'AND';
        }
        newRules.push({ field: 'from', operator: 'contains', value: '' } as RuleCondition);

        onChange({
            rules: newRules
        });
    };

    const handleRemoveCondition = (index: number) => {
        const newRules = conditions.rules.filter((_, i) => i !== index);
        // Clear nextOperator from the new last condition
        if (newRules.length > 0) {
            newRules[newRules.length - 1].nextOperator = undefined;
        }
        onChange({
            rules: newRules
        });
    };

    const handleConditionChange = (index: number, field: keyof RuleCondition, value: string) => {
        const updatedRules = [...conditions.rules];
        updatedRules[index] = {
            ...updatedRules[index],
            [field]: value
        };
        onChange({
            rules: updatedRules
        });
    };

    const handleNextOperatorChange = (index: number, operator: 'AND' | 'OR') => {
        const updatedRules = [...conditions.rules];
        updatedRules[index] = {
            ...updatedRules[index],
            nextOperator: operator
        };
        onChange({
            rules: updatedRules
        });
    };

    return (
        <div className="space-y-4">
            {/* Conditions List */}
            <div className="space-y-2">
                {conditions.rules.map((condition, index) => (
                    <div key={index}>
                        {/* Condition Row */}
                        <div className="p-3 bg-gray-50 rounded-lg">
                            <div className="flex items-start gap-2">
                                <div className="flex-1 flex flex-col gap-2 min-w-0">
                                    {/* Field + Operator row */}
                                    <div className="flex gap-2">
                                        {/* Field Select */}
                                        <select
                                            value={condition.field}
                                            onChange={(e) => handleConditionChange(index, 'field', e.target.value)}
                                            className="flex-1 min-w-0 px-2 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white"
                                        >
                                            {fieldOptions.map(opt => (
                                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                                            ))}
                                        </select>

                                        {/* Operator Select */}
                                        <select
                                            value={condition.operator}
                                            onChange={(e) => handleConditionChange(index, 'operator', e.target.value)}
                                            className="flex-1 min-w-0 px-2 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white"
                                        >
                                            {operatorOptions.map(opt => (
                                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Value Input */}
                                    <div className="flex flex-col">
                                        <input
                                            type="text"
                                            value={condition.value}
                                            onChange={(e) => handleConditionChange(index, 'value', e.target.value)}
                                            placeholder={isRegexOperator(condition.operator) ? '正規表現 (例: ^info@.*\\.com$)' : '値を入力'}
                                            className={`w-full px-3 py-2 text-base border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none ${isRegexOperator(condition.operator) ? 'font-mono text-sm' : ''} ${regexErrors[index] ? 'border-red-500' : ''}`}
                                            required
                                        />
                                        {regexErrors[index] && (
                                            <span className="text-xs text-red-600 mt-0.5">{regexErrors[index]}</span>
                                        )}
                                    </div>
                                </div>

                                {/* Remove Button */}
                                <button
                                    type="button"
                                    onClick={() => handleRemoveCondition(index)}
                                    className="flex-shrink-0 p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    disabled={conditions.rules.length === 1}
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Logical Operator between conditions */}
                        {index < conditions.rules.length - 1 && (
                            <div className="flex justify-center py-1">
                                <button
                                    type="button"
                                    onClick={() => {
                                        const currentOp = condition.nextOperator || 'AND';
                                        handleNextOperatorChange(index, currentOp === 'AND' ? 'OR' : 'AND');
                                    }}
                                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all hover:scale-105 ${
                                        (condition.nextOperator || 'AND') === 'AND'
                                            ? 'bg-blue-500 text-white shadow-md'
                                            : 'bg-amber-500 text-white shadow-md'
                                    }`}
                                    title="クリックして切り替え"
                                >
                                    {(condition.nextOperator || 'AND') === 'AND' ? 'AND (すべて一致)' : 'OR (いずれか一致)'}
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Add Condition Button */}
            <button
                type="button"
                onClick={handleAddCondition}
                className="flex items-center space-x-2 px-4 py-2 text-brand-600 hover:bg-brand-50 rounded-lg transition-colors font-medium"
            >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>条件を追加</span>
            </button>
        </div>
    );
}
