import { useState, useEffect, useRef } from 'react';

interface SearchBarProps {
    onSearch: (query: string) => void;
    placeholder?: string;
}

/**
 * 検索バーコンポーネント
 * デバウンス機能付きで、入力後300msで検索を実行
 */
export default function SearchBar({ onSearch, placeholder = 'メールを検索...' }: SearchBarProps) {
    const [searchText, setSearchText] = useState('');
    const [showHints, setShowHints] = useState(false);
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

    // 外側クリックでヒントを閉じる
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setShowHints(false);
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
                onFocus={() => setShowHints(true)}
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

            {/* 検索ヒント */}
            {showHints && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-[400px] overflow-y-auto">
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
                                    setShowHints(false);
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
    );
}
