import { useState, useEffect, useRef, useMemo } from 'react';
import { getSearchHistory, removeSearchHistoryItem, clearSearchHistory } from '../utils/searchHistory';
import type { SearchHistoryItem } from '../types/search';
import type { Label } from '../types/label';

interface SearchBarProps {
    onSearch: (query: string) => void;
    placeholder?: string;
    mails?: Array<{ from: string; to?: string; subject?: string }>;
    labels?: Label[];
}

/**
 * タイムスタンプを相対時間表示にフォーマット
 */
function formatTimestamp(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'たった今';
    if (minutes < 60) return `${minutes}分前`;
    if (hours < 24) return `${hours}時間前`;
    if (days < 7) return `${days}日前`;
    return new Date(timestamp).toLocaleDateString();
}

/**
 * 検索バーコンポーネント
 * デバウンス機能付きで、入力後300msで検索を実行
 */
export default function SearchBar({ onSearch, placeholder = 'メールを検索...', mails = [], labels = [] }: SearchBarProps) {
    const [searchText, setSearchText] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [activeTab, setActiveTab] = useState<'history' | 'operators'>('history');
    const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
    const debounceTimerRef = useRef<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // デバウンス処理: 300ms後に検索実行
    useEffect(() => {
        // 既存のタイマーをクリア
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        // 新しいタイマーをセット
        debounceTimerRef.current = window.setTimeout(() => {
            onSearch(searchText);
        }, 300);

        // クリーンアップ
        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, [searchText, onSearch]);

    // 検索履歴を読み込む
    useEffect(() => {
        const loadHistory = () => {
            const history = getSearchHistory();
            setSearchHistory(history);
        };

        loadHistory();

        // フォーカス時に履歴を再読み込み
        const handleFocus = () => loadHistory();
        window.addEventListener('focus', handleFocus);

        return () => {
            window.removeEventListener('focus', handleFocus);
        };
    }, []);

    // 外側クリックでドロップダウンを閉じる
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // クリアボタンハンドラー
    const handleClear = () => {
        setSearchText('');
    };

    // 履歴から検索
    const handleHistoryClick = (query: string) => {
        setSearchText(query);
        setShowDropdown(false);
    };

    // 履歴アイテムを削除
    const handleRemoveHistory = (id: string, event: React.MouseEvent) => {
        event.stopPropagation();
        removeSearchHistoryItem(id);
        setSearchHistory(getSearchHistory());
    };

    // 履歴を全てクリア
    const handleClearHistory = () => {
        clearSearchHistory();
        setSearchHistory([]);
    };

    // 現在入力中の演算子とその値を検出
    const currentOperator = useMemo(() => {
        if (!searchText) return null;

        // カーソル位置を想定（最後尾）
        const cursorPos = searchText.length;
        const beforeCursor = searchText.substring(0, cursorPos);

        // 最後のスペースまたは文字列の先頭から現在のトークンを取得
        const lastSpaceIndex = beforeCursor.lastIndexOf(' ');
        const currentToken = beforeCursor.substring(lastSpaceIndex + 1);

        // 演算子を検出
        const operatorMatch = currentToken.match(/^(from|to|subject|label):(.*)$/i);
        if (operatorMatch) {
            return {
                operator: operatorMatch[1].toLowerCase() as 'from' | 'to' | 'subject' | 'label',
                value: operatorMatch[2],
                startPos: lastSpaceIndex + 1
            };
        }

        return null;
    }, [searchText]);

    // サジェストを生成
    const suggestions = useMemo(() => {
        if (!currentOperator) return [];

        const { operator, value } = currentOperator;
        const lowerValue = value.toLowerCase();

        switch (operator) {
            case 'from': {
                // 送信者のユニークなリストを作成
                const senders = Array.from(new Set(mails.map(m => m.from)))
                    .filter(sender => sender.toLowerCase().includes(lowerValue))
                    .slice(0, 10);
                return senders;
            }
            case 'to': {
                // 受信者のユニークなリストを作成
                const recipients = Array.from(new Set(mails.map(m => m.to).filter(Boolean) as string[]))
                    .filter(recipient => recipient.toLowerCase().includes(lowerValue))
                    .slice(0, 10);
                return recipients;
            }
            case 'subject': {
                // 件名のユニークなリストを作成（部分一致）
                const subjects = Array.from(new Set(mails.map(m => m.subject).filter(Boolean) as string[]))
                    .filter(subject => subject.toLowerCase().includes(lowerValue))
                    .slice(0, 10);
                return subjects;
            }
            case 'label': {
                // ラベル名のリストを作成
                const labelNames = labels
                    .map(l => l.name)
                    .filter(name => name.toLowerCase().includes(lowerValue))
                    .slice(0, 10);
                return labelNames;
            }
            default:
                return [];
        }
    }, [currentOperator, mails, labels]);

    // サジェストの表示/非表示を制御
    useEffect(() => {
        setShowSuggestions(currentOperator !== null && suggestions.length > 0);
    }, [currentOperator, suggestions]);

    // サジェストをクリックして補完
    const handleSuggestionClick = (suggestion: string) => {
        if (!currentOperator) return;

        const { operator, startPos } = currentOperator;
        const beforeOperator = searchText.substring(0, startPos);
        const newText = `${beforeOperator}${operator}:${suggestion} `;

        setSearchText(newText);
        setShowSuggestions(false);
    };

    // 検索演算子のヒント
    const hints = [
        { operator: 'from:送信者', description: '送信者で絞り込み' },
        { operator: 'to:受信者', description: '受信者で絞り込み' },
        { operator: 'subject:件名', description: '件名で絞り込み' },
        { operator: 'label:ラベル名', description: 'ラベルで絞り込み' },
        { operator: 'is:unread', description: '未読メールのみ' },
        { operator: 'is:read', description: '既読メールのみ' },
        { operator: 'has:attachment', description: '添付ファイル付きのみ' },
        { operator: '-from:送信者', description: '送信者を除外' },
        { operator: '-subject:件名', description: '件名を除外' }
    ];

    return (
        <div ref={containerRef} className="relative w-full">
            {/* 検索アイコン */}
            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg
                    className="w-5 h-5 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                </svg>
            </div>

            {/* 検索入力フィールド */}
            <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onFocus={() => {
                    setShowDropdown(true);
                    setActiveTab('history');
                }}
                placeholder={placeholder}
                className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition-all"
            />

            {/* クリアボタン */}
            {searchText && (
                <button
                    onClick={handleClear}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label="検索をクリア"
                >
                    <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                        />
                    </svg>
                </button>
            )}

            {/* サジェストドロップダウン */}
            {showSuggestions && !showDropdown && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-[300px] overflow-y-auto">
                    <div className="p-2 border-b border-gray-100 bg-gray-50">
                        <div className="text-xs font-semibold text-gray-700">
                            {currentOperator?.operator}:{' '}
                            <span className="text-brand-600">{currentOperator?.value || '...'}</span>
                        </div>
                    </div>
                    <div className="p-2">
                        {suggestions.map((suggestion, index) => (
                            <button
                                key={index}
                                onClick={() => handleSuggestionClick(suggestion)}
                                className="w-full text-left px-3 py-2 hover:bg-brand-50 rounded-md transition-colors group"
                            >
                                <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-brand-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                    <div className="text-sm text-gray-900 truncate flex-1">
                                        {suggestion}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* 検索ドロップダウン（履歴・演算子） */}
            {showDropdown && !showSuggestions && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-[500px] overflow-hidden flex flex-col">
                    {/* タブヘッダー */}
                    <div className="flex border-b border-gray-200">
                        <button
                            onClick={() => setActiveTab('history')}
                            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                                activeTab === 'history'
                                    ? 'text-brand-600 border-b-2 border-brand-600'
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            履歴
                        </button>
                        <button
                            onClick={() => setActiveTab('operators')}
                            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                                activeTab === 'operators'
                                    ? 'text-brand-600 border-b-2 border-brand-600'
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            演算子
                        </button>
                    </div>

                    {/* タブコンテンツ */}
                    <div className="overflow-y-auto max-h-[400px]">
                        {/* 履歴タブ */}
                        {activeTab === 'history' && (
                            <div className="p-2">
                                {searchHistory.length === 0 ? (
                                    <div className="p-8 text-center text-gray-500 text-sm">
                                        検索履歴がありません
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center justify-between px-3 py-2 mb-1">
                                            <div className="text-xs font-semibold text-gray-700">最近の検索</div>
                                            <button
                                                onClick={handleClearHistory}
                                                className="text-xs text-red-600 hover:text-red-700 font-medium"
                                            >
                                                すべて削除
                                            </button>
                                        </div>
                                        {searchHistory.map((item) => (
                                            <button
                                                key={item.id}
                                                onClick={() => handleHistoryClick(item.query)}
                                                className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded-md transition-colors flex items-center justify-between group"
                                            >
                                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm text-gray-900 truncate">
                                                            {item.query}
                                                        </div>
                                                        <div className="text-xs text-gray-500">
                                                            {formatTimestamp(item.timestamp)}
                                                        </div>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={(e) => handleRemoveHistory(item.id, e)}
                                                    className="text-gray-400 hover:text-red-600 transition-colors ml-2 flex-shrink-0"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            </button>
                                        ))}
                                    </>
                                )}
                            </div>
                        )}

                        {/* 演算子タブ */}
                        {activeTab === 'operators' && (
                            <div>
                                <div className="p-3 border-b border-gray-100">
                                    <div className="text-xs font-semibold text-gray-700 mb-1">検索演算子</div>
                                    <div className="text-xs text-gray-500">高度な検索を実行するには、以下の演算子を使用してください</div>
                                </div>
                                <div className="p-2">
                                    {hints.map((hint, index) => (
                                        <button
                                            key={index}
                                            onClick={() => {
                                                setSearchText(searchText + (searchText ? ' ' : '') + hint.operator);
                                                setShowDropdown(false);
                                            }}
                                            className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded-md transition-colors flex items-center justify-between group"
                                        >
                                            <div className="flex-1">
                                                <div className="text-sm font-mono text-brand-600 group-hover:text-brand-700">
                                                    {hint.operator}
                                                </div>
                                                <div className="text-xs text-gray-500 mt-0.5">
                                                    {hint.description}
                                                </div>
                                            </div>
                                            <div className="text-gray-400 group-hover:text-gray-600">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                </svg>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
