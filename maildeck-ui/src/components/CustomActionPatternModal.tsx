import { useEffect, useState } from 'react';
import { useModalClose } from '../hooks/useModalClose';
import { useToast } from '../contexts/ToastContext';
import type { CustomActionPattern, RegexPatternEntry } from '../types/customAction';
import { validateRegexPattern, testRegexPattern, testMultiRegexPattern } from '../utils/patternMatcher';

interface CustomActionPatternModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (pattern: {
        patternName: string;
        patternType: string;
        regexPattern: string;
        regexPatterns: { patterns: RegexPatternEntry[] };
        actionType: string;
        priority: number;
        isEnabled: boolean;
        description?: string;
        linkTemplate?: string;
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
    // Multi-regex patterns: at least one entry
    const [regexEntries, setRegexEntries] = useState<RegexPatternEntry[]>([{ regex: '', nextOperator: undefined }]);
    const [actionType, setActionType] = useState<string>('copy');
    const [linkTemplate, setLinkTemplate] = useState('');
    const [priority, setPriority] = useState(0);
    const [isEnabled, setIsEnabled] = useState(true);
    const [description, setDescription] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Test preview
    const [testText, setTestText] = useState('');
    const [testResults, setTestResults] = useState<string[]>([]);
    const [regexErrors, setRegexErrors] = useState<(string | null)[]>([null]);
    const [linkTemplateError, setLinkTemplateError] = useState<string | null>(null);

    // Computed: first error (for link preview check)
    const regexError = regexErrors[0] ?? null;

    const { modalContentRef, handleBackdropClick } = useModalClose(isOpen, onClose);
    const toast = useToast();

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setPatternName(initialData.patternName);
                setPatternType(initialData.patternType);
                // Load multi-regex or fall back to single regex
                const entries = (initialData.regexPatterns?.patterns?.length ?? 0) > 0
                    ? initialData.regexPatterns!.patterns
                    : [{ regex: initialData.regexPattern, nextOperator: undefined as undefined }];
                setRegexEntries(entries);
                setRegexErrors(entries.map(() => null));
                setActionType(initialData.actionType);
                setLinkTemplate(initialData.linkTemplate || '');
                setPriority(initialData.priority);
                setIsEnabled(initialData.isEnabled);
                setDescription(initialData.description || '');
            } else {
                setPatternName('');
                setPatternType('otp');
                setRegexEntries([{ regex: '', nextOperator: undefined }]);
                setRegexErrors([null]);
                setActionType('copy');
                setLinkTemplate('');
                setPriority(0);
                setIsEnabled(true);
                setDescription('');
            }
            setTestText('');
            setTestResults([]);
            setLinkTemplateError(null);
        }
    }, [isOpen, initialData]);

    // Validate all regex patterns on change
    useEffect(() => {
        const errors = regexEntries.map(entry =>
            entry.regex ? validateRegexPattern(entry.regex) : null
        );
        setRegexErrors(errors);
    }, [regexEntries]);

    // Validate link template on change
    useEffect(() => {
        if (actionType === 'link') {
            if (!linkTemplate.trim()) {
                setLinkTemplateError('リンクアクションにはURLテンプレートが必要です。');
            } else if (!linkTemplate.includes('{value}')) {
                setLinkTemplateError('URLテンプレートには {value} プレースホルダーが必要です。');
            } else if (!linkTemplate.startsWith('http://') && !linkTemplate.startsWith('https://')) {
                setLinkTemplateError('URLテンプレートは http:// または https:// で始まる必要があります。');
            } else if (linkTemplate.length > 2048) {
                setLinkTemplateError('URLテンプレートは2048文字以内にしてください。');
            } else {
                setLinkTemplateError(null);
            }
        } else {
            setLinkTemplateError(null);
        }
    }, [actionType, linkTemplate]);

    // Run test when test text or regex patterns change
    useEffect(() => {
        const validEntries = regexEntries
            .map((e, i) => ({ ...e, _idx: i }))
            .filter(e => e.regex.trim() !== '');
        const hasErrors = validEntries.some(e => regexErrors[e._idx] !== null && regexErrors[e._idx] !== undefined);
        if (testText && validEntries.length > 0 && !hasErrors) {
            // Rebuild nextOperator chain for valid entries
            const entries = validEntries.map((e, i) => ({
                regex: e.regex,
                nextOperator: i < validEntries.length - 1 ? (e.nextOperator ?? 'AND') : undefined
            }));
            if (entries.length === 1) {
                setTestResults(testRegexPattern(entries[0].regex, testText));
            } else {
                // Apply AND/OR logic: extract from first pattern only if conditions pass
                setTestResults(testMultiRegexPattern(entries, testText));
            }
        } else {
            setTestResults([]);
        }
    }, [testText, regexEntries, regexErrors]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validation
        if (!patternName.trim()) {
            toast.error('パターン名を入力してください。');
            return;
        }

        const validEntries = regexEntries.filter(e => e.regex.trim() !== '');
        if (validEntries.length === 0) {
            toast.error('正規表現パターンを1つ以上入力してください。');
            return;
        }

        if (regexErrors.some(e => e !== null)) {
            toast.error('無効な正規表現パターンがあります。');
            return;
        }

        if (linkTemplateError) {
            toast.error(linkTemplateError);
            return;
        }

        // Normalize: last entry has no nextOperator
        const normalizedEntries = validEntries.map((e, i) => ({
            regex: e.regex,
            nextOperator: i < validEntries.length - 1 ? (e.nextOperator ?? 'AND') : undefined
        }));

        setIsSaving(true);
        try {
            await onSave({
                patternName,
                patternType,
                regexPattern: normalizedEntries[0].regex,
                regexPatterns: { patterns: normalizedEntries },
                actionType,
                priority,
                isEnabled,
                description: description.trim() || undefined,
                linkTemplate: actionType === 'link' ? linkTemplate.trim() : undefined
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
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={handleBackdropClick}>
            <div
                ref={modalContentRef}
                className="bg-white rounded-t-2xl md:rounded-xl shadow-xl w-full max-w-3xl relative z-10 flex flex-col max-h-[95dvh] md:max-h-[90vh]"
            >
                <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
                    <h2 className="text-base font-bold text-gray-800">
                        {initialData ? 'パターンを編集' : 'パターンを作成'}
                    </h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
                <div className="p-4 space-y-4 overflow-y-auto flex-1">
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
                    <div className="grid grid-cols-2 gap-3">
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
                                <option value="link">リンク</option>
                                <option value="highlight">ハイライト</option>
                            </select>
                            <p className="text-xs text-gray-500 mt-1">
                                コピー: コピーボタン表示、リンク: 外部リンクを開く、ハイライト: 強調表示のみ
                            </p>
                        </div>
                    </div>

                    {/* Link Template (only for link action) */}
                    {actionType === 'link' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                URLテンプレート <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={linkTemplate}
                                onChange={(e) => setLinkTemplate(e.target.value)}
                                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all font-mono text-sm ${
                                    linkTemplateError ? 'border-red-500' : ''
                                }`}
                                placeholder="例: https://track.example.com/{value}"
                                required
                            />
                            {linkTemplateError && (
                                <p className="text-sm text-red-600 mt-1">{linkTemplateError}</p>
                            )}
                            <p className="text-xs text-gray-500 mt-1">
                                {'{value}'} プレースホルダーがマッチした値に置き換えられます。
                                例: 追跡番号 123456 → https://track.example.com/123456
                            </p>
                            {/* Link preview */}
                            {testResults.length > 0 && linkTemplate && !linkTemplateError && (
                                <div className="mt-2 p-2 bg-indigo-50 rounded border border-indigo-200">
                                    <div className="text-xs font-medium text-indigo-700 mb-1">生成されるURL例:</div>
                                    <div className="text-xs font-mono text-indigo-600 break-all">
                                        {linkTemplate.replace(/\{value\}/g, encodeURIComponent(testResults[0]))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Regex Patterns (multi) */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            正規表現パターン <span className="text-red-500">*</span>
                        </label>
                        <div className="space-y-2">
                            {regexEntries.map((entry, idx) => (
                                <div key={idx}>
                                    <div className="flex items-start space-x-2">
                                        <input
                                            type="text"
                                            value={entry.regex}
                                            onChange={(e) => {
                                                const updated = [...regexEntries];
                                                updated[idx] = { ...updated[idx], regex: e.target.value };
                                                setRegexEntries(updated);
                                            }}
                                            className={`flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all font-mono text-sm ${
                                                regexErrors[idx] ? 'border-red-500' : ''
                                            }`}
                                            placeholder={idx === 0 ? '例: \\b\\d{6}\\b' : '追加パターン...'}
                                            required={idx === 0}
                                        />
                                        {regexEntries.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const updated = regexEntries.filter((_, i) => i !== idx);
                                                    // Clear nextOperator from new last entry
                                                    if (updated.length > 0) updated[updated.length - 1] = { ...updated[updated.length - 1], nextOperator: undefined };
                                                    setRegexEntries(updated);
                                                }}
                                                className="flex-shrink-0 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                title="削除"
                                            >
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>
                                    {regexErrors[idx] && (
                                        <p className="text-xs text-red-600 mt-0.5">{regexErrors[idx]}</p>
                                    )}
                                    {/* AND/OR toggle between entries */}
                                    {idx < regexEntries.length - 1 && (
                                        <div className="flex justify-center py-1">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const updated = [...regexEntries];
                                                    const current = updated[idx].nextOperator ?? 'AND';
                                                    updated[idx] = { ...updated[idx], nextOperator: current === 'AND' ? 'OR' : 'AND' };
                                                    setRegexEntries(updated);
                                                }}
                                                className={`px-4 py-1 rounded-full text-xs font-bold transition-all hover:scale-105 ${
                                                    (entry.nextOperator ?? 'AND') === 'AND'
                                                        ? 'bg-blue-500 text-white shadow-md'
                                                        : 'bg-amber-500 text-white shadow-md'
                                                }`}
                                                title="クリックして切り替え"
                                            >
                                                {(entry.nextOperator ?? 'AND') === 'AND' ? 'AND (すべてに含む)' : 'OR (いずれかに含む)'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                const updated = [...regexEntries];
                                // Set nextOperator on current last entry
                                if (updated.length > 0) updated[updated.length - 1] = { ...updated[updated.length - 1], nextOperator: 'AND' };
                                setRegexEntries([...updated, { regex: '', nextOperator: undefined }]);
                                setRegexErrors([...regexErrors, null]);
                            }}
                            className="mt-2 flex items-center space-x-1 text-brand-600 hover:bg-brand-50 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            <span>パターンを追加</span>
                        </button>
                        <p className="text-xs text-gray-500 mt-1">
                            JavaScriptの正規表現構文。AND: 本文が全パターンに含む、OR: いずれかに含む。例: \b\d{'{6}'}\b は6桁の数字。
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
                            disabled={isSaving || regexErrors.some(e => !!e) || !!linkTemplateError}
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
