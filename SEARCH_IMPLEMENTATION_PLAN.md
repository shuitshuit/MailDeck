# Gmail風検索機能 実装計画書

## 概要
MailDeckにGmailのような高度な検索機能を追加し、ユーザーが効率的にメールを検索できるようにする。

## 目標
- キーワードによる全文検索
- 高度な検索演算子（from:, to:, subject:, has:, label: など）
- リアルタイム検索フィルタリング
- 検索履歴の保存と再利用
- レスポンシブな検索UI

---

## 機能要件

### 1. 基本検索機能
#### 1.1 検索バーUI
- **配置**: ダッシュボードページのヘッダー部分
- **デザイン**:
  - プレースホルダー: "メールを検索... (例: from:sender@example.com)"
  - 検索アイコン
  - クリア/リセットボタン
  - モバイル対応（折りたたみ可能）

#### 1.2 検索対象フィールド
- **件名 (subject)**
- **送信者 (from)**
- **受信者 (to, cc)**
- **本文 (body)** - クライアント側で既に取得済みのメールのみ
- **ラベル (label)**

### 2. 高度な検索演算子

#### 2.1 サポートする演算子
| 演算子 | 説明 | 例 |
|--------|------|-----|
| `from:` | 送信者でフィルタ | `from:user@example.com` |
| `to:` | 受信者でフィルタ | `to:me@example.com` |
| `subject:` | 件名でフィルタ | `subject:重要` |
| `label:` | ラベルでフィルタ | `label:仕事` |
| `has:attachment` | 添付ファイルあり | `has:attachment` |
| `is:unread` | 未読のみ | `is:unread` |
| `is:read` | 既読のみ | `is:read` |
| `-` | 除外 | `-from:spam@example.com` |
| `OR` | OR条件 | `from:user1 OR from:user2` |
| `""` | 完全一致 | `"重要な会議"` |

#### 2.2 複数演算子の組み合わせ
```
from:boss@example.com subject:報告書 is:unread
label:仕事 has:attachment -subject:スパム
```

### 3. 検索履歴機能
- **保存場所**: localStorage（最大10件）
- **表示**: 検索バーフォーカス時にドロップダウン
- **機能**:
  - クリックで再検索
  - 削除ボタン
  - 全履歴クリア

### 4. 高度な検索UI (オプション)
- **開閉可能なパネル**: "詳細検索"ボタンをクリックで展開
- **フォームフィールド**:
  - 送信者
  - 受信者
  - 件名
  - ラベル選択
  - 日付範囲
  - 既読/未読
  - 添付ファイルの有無

---

## 技術設計

### 1. アーキテクチャ

```
┌─────────────────────────────────────┐
│      SearchBar Component            │
│  - 入力フィールド                    │
│  - 検索履歴ドロップダウン            │
│  - 高度な検索パネル (オプション)     │
└──────────────┬──────────────────────┘
               │
               ↓
┌─────────────────────────────────────┐
│     SearchContext (Optional)        │
│  - 検索クエリの状態管理              │
│  - 検索履歴の管理                    │
└──────────────┬──────────────────────┘
               │
               ↓
┌─────────────────────────────────────┐
│     SearchParser Utility            │
│  - クエリ文字列の解析                │
│  - 演算子の抽出                      │
│  - 検索条件オブジェクトに変換        │
└──────────────┬──────────────────────┘
               │
               ↓
┌─────────────────────────────────────┐
│     DashboardPage                   │
│  - メール一覧のフィルタリング        │
│  - 検索結果の表示                    │
└─────────────────────────────────────┘
```

### 2. データ構造

#### 2.1 SearchQuery Interface
```typescript
interface SearchQuery {
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
```

#### 2.2 SearchHistory Interface
```typescript
interface SearchHistoryItem {
  id: string;
  query: string;
  timestamp: number;
}
```

### 3. コンポーネント設計

#### 3.1 SearchBar Component
```typescript
// maildeck-ui/src/components/SearchBar.tsx
interface SearchBarProps {
  onSearch: (query: SearchQuery) => void;
  placeholder?: string;
}
```

**機能**:
- 検索入力フィールド
- リアルタイム検索（デバウンス 300ms）
- 検索履歴ドロップダウン
- クリアボタン

#### 3.2 AdvancedSearch Component (オプション)
```typescript
// maildeck-ui/src/components/AdvancedSearch.tsx
interface AdvancedSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onSearch: (query: SearchQuery) => void;
  labels: Label[];
}
```

**機能**:
- フォームベースの高度な検索
- ラベル選択
- 日付範囲ピッカー

#### 3.3 SearchParser Utility
```typescript
// maildeck-ui/src/utils/searchParser.ts
export function parseSearchQuery(queryString: string): SearchQuery;
export function buildQueryString(query: SearchQuery): string;
```

**機能**:
- クエリ文字列の解析
- 正規表現による演算子抽出
- 検索条件オブジェクトへの変換

#### 3.4 SearchHistory Utility
```typescript
// maildeck-ui/src/utils/searchHistory.ts
export function getSearchHistory(): SearchHistoryItem[];
export function addSearchHistory(query: string): void;
export function removeSearchHistory(id: string): void;
export function clearSearchHistory(): void;
```

**機能**:
- localStorageへの読み書き
- 最大10件の履歴管理

### 4. フィルタリングロジック

#### 4.1 DashboardPageでの実装
```typescript
// DashboardPage.tsx内
const [searchQuery, setSearchQuery] = useState<SearchQuery | null>(null);

const filteredMails = useMemo(() => {
  let result = mails;

  // ラベルフィルタ (既存)
  if (selectedLabelId) {
    result = result.filter(mail =>
      mail.labels?.some(label => label.id === selectedLabelId)
    );
  }

  // 検索フィルタ (新規)
  if (searchQuery) {
    result = filterMailsByQuery(result, searchQuery);
  }

  return result;
}, [mails, selectedLabelId, searchQuery]);
```

#### 4.2 フィルタ関数
```typescript
function filterMailsByQuery(mails: Email[], query: SearchQuery): Email[] {
  return mails.filter(mail => {
    // キーワード検索
    if (query.keywords.length > 0) {
      const searchText = `${mail.subject} ${mail.from}`.toLowerCase();
      const matches = query.keywords.every(keyword =>
        searchText.includes(keyword.toLowerCase())
      );
      if (!matches) return false;
    }

    // from: フィルタ
    if (query.from && query.from.length > 0) {
      const matches = query.from.some(from =>
        mail.from.toLowerCase().includes(from.toLowerCase())
      );
      if (!matches) return false;
    }

    // subject: フィルタ
    if (query.subject && query.subject.length > 0) {
      const matches = query.subject.some(subject =>
        mail.subject.toLowerCase().includes(subject.toLowerCase())
      );
      if (!matches) return false;
    }

    // label: フィルタ
    if (query.labels && query.labels.length > 0) {
      const matches = query.labels.some(labelName =>
        mail.labels?.some(label =>
          label.name.toLowerCase() === labelName.toLowerCase()
        )
      );
      if (!matches) return false;
    }

    // is:unread フィルタ
    if (query.isUnread !== undefined) {
      if (mail.isRead === query.isUnread) return false;
    }

    // 除外条件
    if (query.exclude) {
      if (query.exclude.from) {
        const excluded = query.exclude.from.some(from =>
          mail.from.toLowerCase().includes(from.toLowerCase())
        );
        if (excluded) return false;
      }
    }

    return true;
  });
}
```

---

## UI/UXデザイン

### 1. 検索バーの配置

**デスクトップ**:
```
┌─────────────────────────────────────────────────────┐
│  受信トレイ          [  🔍 メールを検索...  ]  [更新] [作成] │
└─────────────────────────────────────────────────────┘
```

**モバイル**:
```
┌───────────────────┐
│ 受信トレイ    [🔍] │
├───────────────────┤
│ (展開時)          │
│ [  検索...     X] │
└───────────────────┘
```

### 2. 検索履歴ドロップダウン

```
┌────────────────────────────────────┐
│  🔍 メールを検索...                │
├────────────────────────────────────┤
│  📜 最近の検索                      │
│  ✓ from:boss@example.com       [×] │
│  ✓ subject:報告書 is:unread    [×] │
│  ✓ label:仕事 has:attachment   [×] │
│  ─────────────────────────────     │
│  🗑 履歴をクリア                    │
└────────────────────────────────────┘
```

### 3. 高度な検索パネル (オプション)

```
┌────────────────────────────────────┐
│  詳細検索                      [×]  │
├────────────────────────────────────┤
│  送信者: [_________________]       │
│  受信者: [_________________]       │
│  件名:   [_________________]       │
│  ラベル: [▼ 選択...         ]      │
│  ☐ 未読のみ                        │
│  ☐ 添付ファイルあり                │
│                                    │
│           [クリア]  [検索]         │
└────────────────────────────────────┘
```

---

## 実装フェーズ

### Phase 1: 基本検索機能 (MVP)
**目標**: キーワードによるシンプルな検索

**タスク**:
1. ✅ SearchBarコンポーネントの作成
2. ✅ DashboardPageへの統合
3. ✅ キーワードによるフィルタリング実装
4. ✅ 検索結果の表示
5. ✅ レスポンシブ対応

**成果物**:
- 検索バーUI
- 件名・送信者でのキーワード検索
- クリアボタン

### Phase 2: 検索演算子のサポート
**目標**: Gmail風の高度な検索

**タスク**:
1. ✅ SearchParserユーティリティの実装
2. ✅ 演算子解析ロジック (from:, to:, subject:, label:, is:, has:)
3. ✅ 複数演算子の組み合わせ対応
4. ✅ 除外演算子 (-) の実装
5. ✅ フィルタリングロジックの拡張

**成果物**:
- 完全な演算子サポート
- 複雑なクエリの解析

### Phase 3: 検索履歴
**目標**: ユーザーの検索履歴を保存・再利用

**タスク**:
1. ✅ SearchHistoryユーティリティの実装
2. ✅ localStorageへの保存/読み込み
3. ✅ 検索履歴ドロップダウンUI
4. ✅ 履歴からの再検索
5. ✅ 履歴削除機能

**成果物**:
- 検索履歴の保存・表示
- 履歴管理UI

### Phase 4: 高度な検索UI (オプション)
**目標**: フォームベースの詳細検索

**タスク**:
1. ✅ AdvancedSearchモーダルの作成
2. ✅ フォームフィールドの実装
3. ✅ クエリ文字列への変換
4. ✅ ラベル選択の統合

**成果物**:
- 高度な検索モーダル
- フォームベースの検索

---

## パフォーマンス考慮事項

### 1. デバウンス
- 検索入力に300msのデバウンスを適用
- リアルタイム検索のパフォーマンス向上

### 2. メモ化
- `useMemo`でフィルタリング結果をキャッシュ
- 検索クエリが変更されない限り再計算しない

### 3. クライアント側フィルタリング
- **Phase 1-3**: クライアント側で既に取得済みのメールのみ検索
- **将来の拡張**: サーバー側検索APIの実装（大量メール対応）

### 4. 仮想スクロール (将来)
- 検索結果が多い場合の最適化
- React Virtualizedの導入検討

---

## セキュリティ考慮事項

### 1. XSS対策
- ユーザー入力の適切なエスケープ
- DOMベースのXSS防止

### 2. 検索履歴のプライバシー
- localStorageに保存（ブラウザローカル）
- サーバーには送信しない

---

## テスト計画

### 1. 単体テスト
- `parseSearchQuery()`: 各演算子の解析テスト
- `filterMailsByQuery()`: フィルタリングロジックのテスト
- 検索履歴ユーティリティのテスト

### 2. 統合テスト
- 検索バーからフィルタリングまでのフロー
- 複数演算子の組み合わせテスト

### 3. E2Eテスト (将来)
- 実際のメール検索フロー
- 検索履歴の保存・再利用

---

## 将来の拡張

### 1. サーバー側検索
- **目的**: 大量メールの効率的な検索
- **実装**: PostgreSQL全文検索 (tsvector)
- **API**: `GET /api/mail/search?q=<query>`

### 2. 検索候補 (オートコンプリート)
- 送信者名の候補表示
- ラベル名の候補表示
- 過去の検索クエリからの候補

### 3. 保存された検索
- よく使う検索クエリを保存
- ショートカットで素早くアクセス

### 4. 検索結果のハイライト
- 検索キーワードを黄色でハイライト
- 件名・送信者での視覚的強調

---

## ファイル構成

```
maildeck-ui/src/
├── components/
│   ├── SearchBar.tsx              # 検索バーコンポーネント (Phase 1)
│   ├── SearchHistory.tsx          # 検索履歴ドロップダウン (Phase 3)
│   └── AdvancedSearch.tsx         # 高度な検索モーダル (Phase 4)
├── utils/
│   ├── searchParser.ts            # クエリ解析ユーティリティ (Phase 2)
│   └── searchHistory.ts           # 検索履歴管理 (Phase 3)
├── contexts/
│   └── SearchContext.tsx          # 検索状態管理 (オプション)
├── pages/
│   └── DashboardPage.tsx          # 検索統合 (Phase 1-4)
└── types/
    └── search.ts                  # 検索関連の型定義
```

---

## 成功指標 (KPI)

### Phase 1完了時
- ✅ 検索バーが表示され、キーワード検索が機能
- ✅ 検索結果が正しくフィルタリングされる
- ✅ モバイルでも使いやすい

### Phase 2完了時
- ✅ 5種類以上の演算子がサポートされる
- ✅ 複数演算子の組み合わせが機能
- ✅ 検索精度が高い

### Phase 3完了時
- ✅ 検索履歴が保存・表示される
- ✅ 履歴から再検索できる
- ✅ 履歴管理が直感的

### 全体目標
- ✅ ユーザーが5秒以内に目的のメールを見つけられる
- ✅ 検索機能の利用率が20%以上
- ✅ ユーザーフィードバックが肯定的

---

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 大量メールでのパフォーマンス低下 | 高 | デバウンス、メモ化、将来的にサーバー側検索 |
| 複雑なクエリ解析のバグ | 中 | 十分な単体テスト、エッジケースの洗い出し |
| UXの複雑化 | 中 | シンプルなUIを維持、段階的な機能公開 |
| 検索履歴のプライバシー懸念 | 低 | ローカルストレージのみ、サーバー送信なし |

---

## タイムライン (目安)

| フェーズ | 期間 | 主な成果物 |
|---------|------|-----------|
| Phase 1 | 2-3時間 | 基本検索UI + キーワード検索 |
| Phase 2 | 3-4時間 | 演算子サポート + 高度なフィルタリング |
| Phase 3 | 1-2時間 | 検索履歴機能 |
| Phase 4 | 2-3時間 | 高度な検索UI (オプション) |
| **合計** | **8-12時間** | **完全な検索機能** |

---

## まとめ

この実装計画に従うことで、MailDeckにGmail風の強力な検索機能を段階的に追加できます。Phase 1から順に実装し、各フェーズでテストを行いながら進めることで、安定した機能を提供できます。

**次のステップ**: Phase 1の実装を開始し、基本的な検索バーとキーワード検索を実装します。
