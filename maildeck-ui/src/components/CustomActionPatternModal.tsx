import { useEffect, useState } from 'react';
import { useModalClose } from '../hooks/useModalClose';
import { useToast } from '../contexts/ToastContext';
import type { CustomActionPattern } from '../types/customAction';
import { validateRegexPattern, testRegexPattern } from '../utils/patternMatcher';

interface CustomActionPatternModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (pattern: {
        patternName: string;
        patternType: string;
        regexPattern: string;
        actionType: string;
        priority: number;
        isEnabled: boolean;
        description?: string;
    }) => Promise<void>;
    initialData?: CustomActionPattern | null;
}

export default function CustomActionPatternModal({
    isOpen,
    onClose,
    onSave,
    initialData
}: CustomActionPatternModalProps) {
    const [patternName, setPatternName] = useState('');
    const [patternType, setPatternType] = useState<string>('otp');
    const [regexPattern, setRegexPattern] = useState('');
    const [actionType, setActionType] = useState<string>('copy');
    const [priority, setPriority] = useState(0);
    const [isEnabled, setIsEnabled] = useState(true);
    const [description, setDescription] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Test preview
    const [testText, setTestText] = useState('');
    const [testResults, setTestResults] = useState<string[]>([]);
    const [regexError, setRegexError] = useState<string | null>(null);

    const { modalContentRef, handleBackdropClick } = useModalClose(isOpen, onClose);
    const toast = useToast();

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setPatternName(initialData.patternName);
                setPatternType(initialData.patternType);
                setRegexPattern(initialData.regexPattern);
                setActionType(initialData.actionType);
                setPriority(initialData.priority);
                setIsEnabled(initialData.isEnabled);
                setDescription(initialData.description || '');
            } else {
                setPatternName('');
                setPatternType('otp');
                setRegexPattern('');
                setActionType('copy');
                setPriority(0);
                setIsEnabled(true);
                setDescription('');
            }
            setTestText('');
            setTestResults([]);
            setRegexError(null);
        }
    }, [isOpen, initialData]);

    // Validate regex pattern on change
    useEffect(() => {
        if (regexPattern) {
            const error = validateRegexPattern(regexPattern);
            setRegexError(error);
        } else {
            setRegexError(null);
        }
    }, [regexPattern]);

    // Run test when test text or regex pattern changes
    useEffect(() => {
        if (testText && regexPattern && !regexError) {
            const results = testRegexPattern(regexPattern, testText);
            setTestResults(results);
        } else {
            setTestResults([]);
        }
    }, [testText, regexPattern, regexError]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validation
        if (!patternName.trim()) {
            toast.error('パターン名を入力してください。');
            return;
        }

        if (!regexPattern.trim()) {
            toast.error('正規表現パターンを入力してください。');
            return;
        }

        if (regexError) {
            toast.error('正規表現パターンが無効です。');
            return;
        }

        setIsSaving(true);
        try {
            await onSave({
                patternName,
                patternType,
                regexPattern,
                actionType,
                priority,
                isEnabled,
                description: description.trim() || undefined
            });
            onClose();
        } catch (error) {
            console.error('Failed to save pattern:', error);
            toast.error('パターンの保存に失敗しました。');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={handleBackdropClick}>
            <div
                ref={modalContentRef}
                className="bg-white rounded-xl shadow-xl w-full max-w-3xl relative z-10 p-6 max-h-[90vh] overflow-y-auto"
            >
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-bold text-gray-800">
                        {initialData ? 'パターンを編集' : 'パターンを作成'}
                    </h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Pattern Name */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            パターン名 <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={patternName}
                            onChange={(e) => setPatternName(e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
                            placeholder="例: 6桁数字OTP"
                            required
                        />
                    </div>

                    {/* Pattern Type & Action Type */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                パターンタイプ <span className="text-red-500">*</span>
                            </label>
                            <select
                                value={patternType}
                                onChange={(e) => setPatternType(e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white"
                                required
                            >
                                <option value="otp">OTPコード</option>
                                <option value="tracking">追跡番号</option>
                                <option value="token">トークン</option>
                                <option value="custom">カスタム</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                アクションタイプ <span className="text-red-500">*</span>
                            </label>
                            <select
                                value={actionType}
                                onChange={(e) => setActionType(e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white"
                                required
                            >
                                <option value="copy">コピー</option>
                                <option value="highlight">ハイライト</option>
                            </select>
                            <p className="text-xs text-gray-500 mt-1">
                                ※ セキュリティのため、クライアント側では「コピー」のみ有効です
                            </p>
                        </div>
                    </div>

                    {/* Regex Pattern */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            正規表現パターン <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={regexPattern}
                            onChange={(e) => setRegexPattern(e.target.value)}
                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all font-mono text-sm ${
                                regexError ? 'border-red-500' : ''
                            }`}
                            placeholder="例: \\b\\d{6}\\b"
                            required
                        />
                        {regexError && (
                            <p className="text-sm text-red-600 mt-1">{regexError}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                            JavaScriptの正規表現構文を使用します。例: \b\d{'{6}'}\b は6桁の数字にマッチします。
                        </p>
                    </div>

                    {/* Test Preview */}
                    <div className="border rounded-lg p-4 bg-gray-50">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            テストプレビュー
                        </label>
                        <textarea
                            value={testText}
                            onChange={(e) => setTestText(e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none resize-none"
                            placeholder="サンプルテキストを入力してパターンをテストできます..."
                            rows={3}
                        />
                        {testResults.length > 0 && (
                            <div className="mt-3">
                                <div className="text-sm font-medium text-green-700 mb-2">
                                    マッチ結果 ({testResults.length}件):
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {testResults.map((result, index) => (
                                        <span
                                            key={index}
                                            className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm font-mono"
                                        >
                                            {result}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {testText && testResults.length === 0 && !regexError && (
                            <p className="text-sm text-gray-500 mt-2">マッチする結果がありません</p>
                        )}
                    </div>

                    {/* Priority */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            優先度 (0-999)
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
                            複数のパターンがマッチした場合、優先度の高いパターンが優先されます。
                        </p>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            説明（任意）
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none resize-none"
                            placeholder="このパターンの説明を入力..."
                            rows={2}
                        />
                    </div>

                    {/* Enabled Toggle (only for edit mode) */}
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
                                パターンを有効にする
                            </label>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-end space-x-3 pt-4 border-t">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium transition-colors"
                        >
                            キャンセル
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving || !!regexError}
                            className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSaving ? '保存中...' : initialData ? '更新' : '作成'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
