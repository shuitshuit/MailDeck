import type { CustomActionPattern } from '../types/customAction';

interface CustomActionPatternCardProps {
    pattern: CustomActionPattern;
    onEdit: (pattern: CustomActionPattern) => void;
    onDelete: (patternId: string) => void;
    onToggle: (patternId: string) => void;
}

export default function CustomActionPatternCard({ pattern, onEdit, onDelete, onToggle }: CustomActionPatternCardProps) {
    const getPatternTypeLabel = (type: string) => {
        const labels: Record<string, string> = {
            otp: 'OTPコード',
            tracking: '追跡番号',
            token: 'トークン',
            custom: 'カスタム'
        };
        return labels[type] || type;
    };

    const getPatternTypeColor = (type: string) => {
        const colors: Record<string, string> = {
            otp: 'bg-purple-100 text-purple-700',
            tracking: 'bg-green-100 text-green-700',
            token: 'bg-orange-100 text-orange-700',
            custom: 'bg-gray-100 text-gray-700'
        };
        return colors[type] || 'bg-gray-100 text-gray-700';
    };

    const getActionTypeLabel = (type: string) => {
        const labels: Record<string, string> = {
            copy: 'コピー',
            link: 'リンク',
            highlight: 'ハイライト'
        };
        return labels[type] || type;
    };

    const getActionTypeIcon = (type: string) => {
        switch (type) {
            case 'copy':
                return (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                );
            case 'link':
                return (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                );
            case 'highlight':
                return (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                    </svg>
                );
            default:
                return null;
        }
    };

    return (
        <div className={`bg-white rounded-lg shadow-md p-5 border-l-4 transition-all hover:shadow-lg ${
            pattern.isEnabled ? 'border-brand-500' : 'border-gray-300 opacity-60'
        }`}>
            <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-800">{pattern.patternName}</h3>
                        {!pattern.isEnabled && (
                            <span className="px-2 py-1 text-xs font-medium bg-gray-200 text-gray-600 rounded">
                                無効
                            </span>
                        )}
                    </div>

                    {/* Pattern Type Badge */}
                    <div className="flex items-center space-x-2 mb-3">
                        <span className={`px-2 py-1 text-xs font-medium rounded ${getPatternTypeColor(pattern.patternType)}`}>
                            {getPatternTypeLabel(pattern.patternType)}
                        </span>
                        <div className="flex items-center space-x-1 text-gray-600">
                            {getActionTypeIcon(pattern.actionType)}
                            <span className="text-xs font-medium">
                                {getActionTypeLabel(pattern.actionType)}
                            </span>
                        </div>
                    </div>

                    {/* Regex Pattern */}
                    <div className="mb-3">
                        <div className="text-xs text-gray-500 mb-1">正規表現:</div>
                        <code className="text-sm font-mono bg-gray-100 px-3 py-1.5 rounded border border-gray-200 block overflow-x-auto">
                            {pattern.regexPattern}
                        </code>
                    </div>

                    {/* Link Template (for link action type) */}
                    {pattern.actionType === 'link' && pattern.linkTemplate && (
                        <div className="mb-3">
                            <div className="text-xs text-gray-500 mb-1">URLテンプレート:</div>
                            <code className="text-sm font-mono bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded border border-indigo-200 block overflow-x-auto">
                                {pattern.linkTemplate}
                            </code>
                        </div>
                    )}

                    {/* Description */}
                    {pattern.description && (
                        <div className="text-sm text-gray-600 mb-2">
                            {pattern.description}
                        </div>
                    )}
                </div>

                {/* Priority Badge */}
                <div className="flex flex-col items-end space-y-2">
                    <div className="text-xs text-gray-500">
                        優先度: <span className="font-semibold">{pattern.priority}</span>
                    </div>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end space-x-2 pt-3 border-t">
                {/* Toggle Button */}
                <button
                    onClick={() => onToggle(pattern.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        pattern.isEnabled
                            ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
                            : 'bg-green-50 text-green-700 hover:bg-green-100'
                    }`}
                >
                    {pattern.isEnabled ? '無効化' : '有効化'}
                </button>

                {/* Edit Button */}
                <button
                    onClick={() => onEdit(pattern)}
                    className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 text-sm font-medium transition-colors"
                >
                    編集
                </button>

                {/* Delete Button */}
                <button
                    onClick={() => onDelete(pattern.id)}
                    className="px-3 py-1.5 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 text-sm font-medium transition-colors"
                >
                    削除
                </button>
            </div>
        </div>
    );
}
