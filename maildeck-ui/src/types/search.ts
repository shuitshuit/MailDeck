/**
 * 検索クエリの構造
 */
export interface SearchQuery {
  keywords: string[];        // 一般キーワード
  from?: string[];           // 送信者フィルタ
  to?: string[];             // 受信者フィルタ
  subject?: string[];        // 件名フィルタ
  labels?: string[];         // ラベルフィルタ
  hasAttachment?: boolean;   // 添付ファイルフィルタ
  isUnread?: boolean;        // 未読フィルタ
  exclude?: {                // 除外条件
    from?: string[];
    subject?: string[];
  };
}

/**
 * 検索履歴アイテム
 */
export interface SearchHistoryItem {
  id: string;
  query: string;
  timestamp: number;
}
