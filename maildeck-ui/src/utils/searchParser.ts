import type { SearchQuery } from '../types/search';

/**
 * 検索クエリをパースしてSearchQueryオブジェクトに変換
 *
 * サポートされる演算子:
 * - from:送信者 - 送信者でフィルタ
 * - to:受信者 - 受信者でフィルタ
 * - subject:件名 - 件名でフィルタ
 * - label:ラベル名 - ラベルでフィルタ
 * - is:unread - 未読メールのみ
 * - is:read - 既読メールのみ
 * - has:attachment - 添付ファイル付きのみ
 * - -from:送信者 - 送信者を除外
 * - -subject:件名 - 件名を除外
 *
 * 例:
 * "from:alice subject:会議 is:unread"
 * "label:重要 has:attachment"
 * "-from:spam@example.com"
 */
export function parseSearchQuery(queryString: string): SearchQuery {
    const query: SearchQuery = {
        keywords: []
    };

    // クエリ文字列を空白で分割（引用符内は保持）
    const tokens = tokenizeQuery(queryString);

    for (const token of tokens) {
        // from: 演算子
        if (token.startsWith('from:')) {
            const value = token.substring(5).trim();
            if (value) {
                if (!query.from) query.from = [];
                query.from.push(value);
            }
            continue;
        }

        // to: 演算子
        if (token.startsWith('to:')) {
            const value = token.substring(3).trim();
            if (value) {
                if (!query.to) query.to = [];
                query.to.push(value);
            }
            continue;
        }

        // subject: 演算子
        if (token.startsWith('subject:')) {
            const value = token.substring(8).trim();
            if (value) {
                if (!query.subject) query.subject = [];
                query.subject.push(value);
            }
            continue;
        }

        // label: 演算子
        if (token.startsWith('label:')) {
            const value = token.substring(6).trim();
            if (value) {
                if (!query.labels) query.labels = [];
                query.labels.push(value);
            }
            continue;
        }

        // is: 演算子
        if (token.startsWith('is:')) {
            const value = token.substring(3).toLowerCase().trim();
            if (value === 'unread') {
                query.isUnread = true;
            } else if (value === 'read') {
                query.isUnread = false;
            }
            continue;
        }

        // has: 演算子
        if (token.startsWith('has:')) {
            const value = token.substring(4).toLowerCase().trim();
            if (value === 'attachment') {
                query.hasAttachment = true;
            }
            continue;
        }

        // -from: 除外演算子
        if (token.startsWith('-from:')) {
            const value = token.substring(6).trim();
            if (value) {
                if (!query.exclude) query.exclude = {};
                if (!query.exclude.from) query.exclude.from = [];
                query.exclude.from.push(value);
            }
            continue;
        }

        // -subject: 除外演算子
        if (token.startsWith('-subject:')) {
            const value = token.substring(9).trim();
            if (value) {
                if (!query.exclude) query.exclude = {};
                if (!query.exclude.subject) query.exclude.subject = [];
                query.exclude.subject.push(value);
            }
            continue;
        }

        // 一般キーワード
        if (token.trim()) {
            query.keywords.push(token.trim());
        }
    }

    return query;
}

/**
 * クエリ文字列をトークンに分割
 * 引用符で囲まれた文字列は1つのトークンとして扱う
 */
function tokenizeQuery(queryString: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';

    for (let i = 0; i < queryString.length; i++) {
        const char = queryString[i];

        // 引用符の開始または終了
        if ((char === '"' || char === "'") && !inQuotes) {
            inQuotes = true;
            quoteChar = char;
            continue;
        } else if (char === quoteChar && inQuotes) {
            inQuotes = false;
            quoteChar = '';
            continue;
        }

        // 空白で分割（引用符内は除く）
        if (char === ' ' && !inQuotes) {
            if (current.trim()) {
                tokens.push(current.trim());
                current = '';
            }
            continue;
        }

        current += char;
    }

    // 最後のトークン
    if (current.trim()) {
        tokens.push(current.trim());
    }

    return tokens;
}

/**
 * SearchQueryオブジェクトをユーザーフレンドリーな文字列に変換
 */
export function stringifySearchQuery(query: SearchQuery): string {
    const parts: string[] = [];

    // from
    if (query.from && query.from.length > 0) {
        query.from.forEach(f => parts.push(`from:${f}`));
    }

    // to
    if (query.to && query.to.length > 0) {
        query.to.forEach(t => parts.push(`to:${t}`));
    }

    // subject
    if (query.subject && query.subject.length > 0) {
        query.subject.forEach(s => parts.push(`subject:${s}`));
    }

    // label
    if (query.labels && query.labels.length > 0) {
        query.labels.forEach(l => parts.push(`label:${l}`));
    }

    // is:unread
    if (query.isUnread === true) {
        parts.push('is:unread');
    } else if (query.isUnread === false) {
        parts.push('is:read');
    }

    // has:attachment
    if (query.hasAttachment) {
        parts.push('has:attachment');
    }

    // exclude
    if (query.exclude) {
        if (query.exclude.from) {
            query.exclude.from.forEach(f => parts.push(`-from:${f}`));
        }
        if (query.exclude.subject) {
            query.exclude.subject.forEach(s => parts.push(`-subject:${s}`));
        }
    }

    // keywords
    if (query.keywords.length > 0) {
        parts.push(...query.keywords);
    }

    return parts.join(' ');
}
