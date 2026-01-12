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
    const debounceTimerRef = useRef<number | null>(null);

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

    // クリアボタンハンドラー
    const handleClear = () => {
        setSearchText('');
    };

    return (
        <div className="relative w-full">
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
        </div>
    );
}
