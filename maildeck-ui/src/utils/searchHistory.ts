import type { SearchHistoryItem } from '../types/search';

const STORAGE_KEY = 'maildeck_search_history';
const MAX_HISTORY_ITEMS = 20;

/**
 * 検索履歴をlocalStorageから取得
 */
export function getSearchHistory(): SearchHistoryItem[] {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) {
            return [];
        }
        const history = JSON.parse(stored) as SearchHistoryItem[];

        // タイムスタンプでソート（新しい順）
        return history.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
        console.error('Failed to load search history:', error);
        return [];
    }
}

/**
 * 検索履歴に新しいアイテムを追加
 * 重複する検索クエリは削除し、最新のものを追加
 */
export function addSearchHistory(query: string): void {
    if (!query.trim()) {
        return;
    }

    try {
        const history = getSearchHistory();

        // 同じクエリが既に存在する場合は削除
        const filtered = history.filter(item => item.query !== query);

        // 新しいアイテムを追加
        const newItem: SearchHistoryItem = {
            id: Date.now().toString(),
            query: query.trim(),
            timestamp: Date.now()
        };

        filtered.unshift(newItem);

        // 最大数を超えた場合は古いものを削除
        const trimmed = filtered.slice(0, MAX_HISTORY_ITEMS);

        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch (error) {
        console.error('Failed to save search history:', error);
    }
}

/**
 * 検索履歴から特定のアイテムを削除
 */
export function removeSearchHistoryItem(id: string): void {
    try {
        const history = getSearchHistory();
        const filtered = history.filter(item => item.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    } catch (error) {
        console.error('Failed to remove search history item:', error);
    }
}

/**
 * 検索履歴を全てクリア
 */
export function clearSearchHistory(): void {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
        console.error('Failed to clear search history:', error);
    }
}

/**
 * 検索履歴から特定のクエリを検索
 */
export function searchInHistory(searchText: string): SearchHistoryItem[] {
    if (!searchText.trim()) {
        return getSearchHistory();
    }

    const history = getSearchHistory();
    const lowerSearch = searchText.toLowerCase();

    return history.filter(item =>
        item.query.toLowerCase().includes(lowerSearch)
    );
}
