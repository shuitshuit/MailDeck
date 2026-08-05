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
    // Multi-regex patterns, entered as chips (type a pattern, press Space/Enter to commit)
    const [regexEntries, setRegexEntries] = useState<RegexPatternEntry[]>([]);
    const [patternDraft, setPatternDraft] = useState('');
    const [actionType, setActionType] = useState<string>('copy');
    const [linkTemplate, setLinkTemplate] = useState('');
    const [priority, setPriority] = useState(0);
    const [isEnabled, setIsEnabled] = useState(true);
    const [description, setDescription] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Test preview
    const [testText, setTestText] = useState('');
    const [testResults, setTestResults] = useState<string[]>([]);
    const [regexErrors, setRegexErrors] = useState<(string | null)[]>([]);
    const [linkTemplateError, setLinkTemplateError] = useState<string | null>(null);

    // Computed: first error (for link preview check)
    const regexError = regexErrors[0] ?? null;
    // Validation for the not-yet-committed chip draft
    const draftError = patternDraft.trim() ? validateRegexPattern(patternDraft.trim()) : null;

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
                setRegexEntries([]);
                setRegexErrors([]);
                setActionType('copy');
                setLinkTemplate('');
                setPriority(0);
                setIsEnabled(true);
                setDescription('');
            }
            setPatternDraft('');
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

    // Commit the current draft text as a new pattern chip
    const commitPatternDraft = (value: string = patternDraft) => {
        const trimmed = value.trim();
        if (!trimmed) return;
        setRegexEntries(prev => {
            const updated = [...prev];
            if (updated.length > 0) {
                updated[updated.length - 1] = { ...updated[updated.length - 1], nextOperator: updated[updated.length - 1].nextOperator ?? 'AND' };
            }
            return [...updated, { regex: trimmed, nextOperator: undefined }];
        });
        setPatternDraft('');
    };

    const removePatternChip = (idx: number) => {
        setRegexEntries(prev => {
            const updated = prev.filter((_, i) => i !== idx);
            if (updated.length > 0) updated[updated.length - 1] = { ...updated[updated.length - 1], nextOperator: undefined };
            return updated;
        });
    };

    // Click a chip's text to pull it back into the input for editing
    const editPatternChip = (idx: number) => {
        setPatternDraft(regexEntries[idx].regex);
        removePatternChip(idx);
    };

    const handlePatternDraftKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
            if (patternDraft.trim()) {
                e.preventDefault();
                commitPatternDraft();
            }
        } else if (e.key === 'Backspace' && patternDraft === '' && regexEntries.length > 0) {
            removePatternChip(regexEntries.length - 1);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validation
        if (!patternName.trim()) {
            toast.error('パターン名を入力してください。');
            return;
        }

        const draftTrimmed = patternDraft.trim();
        if (draftTrimmed && validateRegexPattern(draftTrimmed)) {
            toast.error('無効な正規表現パターンがあります。');
            return;
        }

        // Include any not-yet-committed draft text as the final chip
        const allEntries = draftTrimmed
            ? [
                ...regexEntries.map((entry, i) =>
                    i === regexEntries.length - 1 ? { ...entry, nextOperator: entry.nextOperator ?? 'AND' } : entry
                ),
                { regex: draftTrimmed, nextOperator: undefined as undefined }
            ]
            : regexEntries;

        const validEntries = allEntries.filter(entry => entry.regex.trim() !== '');
        if (validEntries.length === 0) {
            toast.error('正規表現パターンを1つ以上入力してください。');
            return;
        }

        if (regexErrors.some(err => err !== null)) {
            toast.error('無効な正規表現パターンがあります。');
            return;
        }

        if (linkTemplateError) {
            toast.error(linkTemplateError);
            return;
        }

        // Normalize: last entry has no nextOperator
        const normalizedEntries = validEntries.map((entry, i) => ({
            regex: entry.regex,
            nextOperator: i < validEntries.length - 1 ? (entry.nextOperator ?? 'AND') : undefined
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
            setPatternDraft('');
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

                    {/* Regex Patterns (multi, chip input) */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            正規表現パターン <span className="text-red-500">*</span>
                        </label>
                        <div
                            className="flex flex-wrap items-center gap-1.5 p-2 border rounded-lg focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-brand-500 transition-all cursor-text"
                            onClick={(e) => {
                                if (e.target === e.currentTarget) (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus();
                            }}
                        >
                            {regexEntries.map((entry, idx) => (
                                <div key={idx} className="flex items-center gap-1.5">
                                    <span
                                        className={`inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-sm font-mono ${
                                            regexErrors[idx] ? 'bg-red-100 text-red-800 ring-1 ring-red-400' : 'bg-brand-100 text-brand-800'
                                        }`}
                                        title={regexErrors[idx] ?? 'クリックして編集'}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => editPatternChip(idx)}
                                            className="max-w-[220px] truncate hover:underline"
                                        >
                                            {entry.regex}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => removePatternChip(idx)}
                                            className="shrink-0 leading-none opacity-70 hover:opacity-100 hover:text-red-600"
                                            title="削除"
                                        >
                                            ×
                                        </button>
                                    </span>
                                    {/* AND/OR toggle between entries, individually switchable */}
                                    {idx < regexEntries.length - 1 && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const updated = [...regexEntries];
                                                const current = updated[idx].nextOperator ?? 'AND';
                                                updated[idx] = { ...updated[idx], nextOperator: current === 'AND' ? 'OR' : 'AND' };
                                                setRegexEntries(updated);
                                            }}
                                            className={`px-3 py-1 rounded-full text-xs font-bold transition-all hover:scale-105 ${
                                                (entry.nextOperator ?? 'AND') === 'AND'
                                                    ? 'bg-blue-500 text-white shadow-md'
                                                    : 'bg-amber-500 text-white shadow-md'
                                            }`}
                                            title="クリックして切り替え"
                                        >
                                            {(entry.nextOperator ?? 'AND') === 'AND' ? 'AND' : 'OR'}
                                        </button>
                                    )}
                                </div>
                            ))}
                            <input
                                type="text"
                                value={patternDraft}
                                onChange={(e) => setPatternDraft(e.target.value)}
                                onKeyDown={handlePatternDraftKeyDown}
                                onBlur={() => commitPatternDraft()}
                                className="flex-1 min-w-[160px] py-1 outline-none bg-transparent font-mono text-sm"
                                placeholder={regexEntries.length === 0 ? '例: \\b\\d{6}\\b （スペースで確定）' : '追加パターン...'}
                            />
                        </div>
                        {draftError && (
                            <p className="text-xs text-red-600 mt-0.5">{draftError}</p>
                        )}
                        {regexErrors.some(err => !!err) && (
                            <p className="text-xs text-red-600 mt-0.5">無効な正規表現があります。赤いボタンにカーソルを合わせると詳細を確認できます。</p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                            パターンを入力してスペースキーかEnterで確定するとボタンになります（×で削除、クリックで編集）。
                            AND: 本文が全パターンに含む、OR: いずれかに含む。例: \b\d{'{6}'}\b は6桁の数字。
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
                            disabled={isSaving || regexErrors.some(e => !!e) || !!linkTemplateError || !!draftError}
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
