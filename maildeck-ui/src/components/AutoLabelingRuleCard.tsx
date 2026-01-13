import type { AutoLabelingRuleWithLabel, RuleConditions } from '../types/autoLabeling';

interface AutoLabelingRuleCardProps {
    rule: AutoLabelingRuleWithLabel;
    onEdit: (rule: AutoLabelingRuleWithLabel) => void;
    onDelete: (ruleId: string) => void;
    onToggle: (ruleId: string) => void;
}

export default function AutoLabelingRuleCard({ rule, onEdit, onDelete, onToggle }: AutoLabelingRuleCardProps) {
    const conditions: RuleConditions = JSON.parse(rule.conditions);

    const getFieldLabel = (field: string) => {
        const labels: Record<string, string> = {
            from: '送信者',
            subject: '件名',
            body: '本文'
        };
        return labels[field] || field;
    };

    const getOperatorLabel = (operator: string) => {
        const labels: Record<string, string> = {
            contains: '含む',
            notcontains: '含まない',
            equals: '一致',
            notequals: '不一致',
            startswith: 'で始まる',
            endswith: 'で終わる'
        };
        return labels[operator] || operator;
    };

    return (
        <div className={`bg-white rounded-lg shadow-md p-5 border-l-4 transition-all hover:shadow-lg ${
            rule.isEnabled ? 'border-brand-500' : 'border-gray-300 opacity-60'
        }`}>
            <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-800">{rule.ruleName}</h3>
                        {!rule.isEnabled && (
                            <span className="px-2 py-1 text-xs font-medium bg-gray-200 text-gray-600 rounded">
                                無効
                            </span>
                        )}
                    </div>

                    {/* Label Badge */}
                    {rule.labelName && (
                        <div className="flex items-center space-x-2 mb-3">
                            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                            </svg>
                            <span
                                className="px-2 py-1 text-xs font-medium rounded"
                                style={{
                                    backgroundColor: `${rule.labelColor}20`,
                                    color: rule.labelColor
                                }}
                            >
                                {rule.labelName}
                            </span>
                        </div>
                    )}

                    {/* Conditions */}
                    <div className="space-y-1 text-sm text-gray-600">
                        <div className="font-medium text-gray-700">
                            条件 ({conditions.operator === 'AND' ? 'すべて一致' : 'いずれか一致'}):
                        </div>
                        {conditions.rules.map((condition, index) => (
                            <div key={index} className="flex items-center space-x-2 pl-4">
                                <span className="text-gray-400">•</span>
                                <span className="font-medium">{getFieldLabel(condition.field)}</span>
                                <span className="text-gray-500">{getOperatorLabel(condition.operator)}</span>
                                <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">
                                    "{condition.value}"
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Priority Badge */}
                <div className="flex flex-col items-end space-y-2">
                    <div className="text-xs text-gray-500">
                        優先度: <span className="font-semibold">{rule.priority}</span>
                    </div>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end space-x-2 pt-3 border-t">
                {/* Toggle Button */}
                <button
                    onClick={() => onToggle(rule.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        rule.isEnabled
                            ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
                            : 'bg-green-50 text-green-700 hover:bg-green-100'
                    }`}
                >
                    {rule.isEnabled ? '無効化' : '有効化'}
                </button>

                {/* Edit Button */}
                <button
                    onClick={() => onEdit(rule)}
                    className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 text-sm font-medium transition-colors"
                >
                    編集
                </button>

                {/* Delete Button */}
                <button
                    onClick={() => onDelete(rule.id)}
                    className="px-3 py-1.5 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 text-sm font-medium transition-colors"
                >
                    削除
                </button>
            </div>
        </div>
    );
}
