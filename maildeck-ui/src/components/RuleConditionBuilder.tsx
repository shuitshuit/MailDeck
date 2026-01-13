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
        { value: 'endswith', label: 'で終わる (ends with)' }
    ];

    const handleAddCondition = () => {
        onChange({
            ...conditions,
            rules: [
                ...conditions.rules,
                { field: 'from', operator: 'contains', value: '' } as RuleCondition
            ]
        });
    };

    const handleRemoveCondition = (index: number) => {
        onChange({
            ...conditions,
            rules: conditions.rules.filter((_, i) => i !== index)
        });
    };

    const handleConditionChange = (index: number, field: keyof RuleCondition, value: string) => {
        const updatedRules = [...conditions.rules];
        updatedRules[index] = {
            ...updatedRules[index],
            [field]: value
        };
        onChange({
            ...conditions,
            rules: updatedRules
        });
    };

    const handleLogicalOperatorChange = (operator: 'AND' | 'OR') => {
        onChange({
            ...conditions,
            operator
        });
    };

    return (
        <div className="space-y-4">
            {/* Logical Operator Selection */}
            {conditions.rules.length > 1 && (
                <div className="flex items-center space-x-4 pb-2 border-b">
                    <span className="text-sm font-medium text-gray-700">条件の結合:</span>
                    <div className="flex space-x-2">
                        <button
                            type="button"
                            onClick={() => handleLogicalOperatorChange('AND')}
                            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                                conditions.operator === 'AND'
                                    ? 'bg-brand-500 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            AND (すべて)
                        </button>
                        <button
                            type="button"
                            onClick={() => handleLogicalOperatorChange('OR')}
                            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                                conditions.operator === 'OR'
                                    ? 'bg-brand-500 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            OR (いずれか)
                        </button>
                    </div>
                </div>
            )}

            {/* Conditions List */}
            <div className="space-y-3">
                {conditions.rules.map((condition, index) => (
                    <div key={index} className="flex items-start space-x-2 p-3 bg-gray-50 rounded-lg">
                        {/* Field Select */}
                        <select
                            value={condition.field}
                            onChange={(e) => handleConditionChange(index, 'field', e.target.value)}
                            className="flex-shrink-0 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white"
                        >
                            {fieldOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>

                        {/* Operator Select */}
                        <select
                            value={condition.operator}
                            onChange={(e) => handleConditionChange(index, 'operator', e.target.value)}
                            className="flex-shrink-0 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white"
                        >
                            {operatorOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>

                        {/* Value Input */}
                        <input
                            type="text"
                            value={condition.value}
                            onChange={(e) => handleConditionChange(index, 'value', e.target.value)}
                            placeholder="値を入力"
                            className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                            required
                        />

                        {/* Remove Button */}
                        <button
                            type="button"
                            onClick={() => handleRemoveCondition(index)}
                            className="flex-shrink-0 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            disabled={conditions.rules.length === 1}
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
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
