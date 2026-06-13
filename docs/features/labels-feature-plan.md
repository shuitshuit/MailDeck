# MailDeck ラベリング機能 実装計画書

## 概要

MailDeckにメールラベリング機能を追加し、ユーザーが自由にラベルを作成してメールを整理できるようにします。

## 目的

- メールの分類・整理を容易にする
- 複数のラベルを1つのメールに付与可能にする
- ラベルによるフィルタリング機能を提供する
- Gmail風の直感的なラベル管理UIを実装する

## 機能要件

### 1. ラベル管理機能
- ラベルの作成（名前、色の指定）
- ラベルの編集（名前・色の変更）
- ラベルの削除
- ラベル一覧の表示

### 2. メールへのラベル付与機能
- メール詳細画面からラベルを追加/削除
- 受信箱画面で複数メールに一括ラベル付与
- ドラッグ&ドロップでのラベル付与（将来拡張）

### 3. ラベルによるフィルタリング機能
- サイドバーにラベル一覧を表示
- ラベルクリックで該当メールのみ表示
- 複数ラベルのAND/OR検索（将来拡張）

## アーキテクチャ設計

### データベース設計

#### 新規テーブル: `labels`

```sql
CREATE TABLE labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(7) NOT NULL DEFAULT '#3B82F6', -- HEX color code
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name) -- ユーザー内でラベル名は一意
);

CREATE INDEX idx_labels_user_id ON labels(user_id);
```

#### 新規テーブル: `mail_labels` (多対多の中間テーブル)

```sql
CREATE TABLE mail_labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_id VARCHAR(500) NOT NULL, -- IMAP Message-ID
    label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    server_config_id UUID NOT NULL REFERENCES user_server_configs(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, message_id, label_id, server_config_id)
);

CREATE INDEX idx_mail_labels_user_id ON mail_labels(user_id);
CREATE INDEX idx_mail_labels_label_id ON mail_labels(label_id);
CREATE INDEX idx_mail_labels_message_id ON mail_labels(message_id, server_config_id);
```

**注意**: IMAPメールはサーバー側に保存されているため、ラベル情報はローカル（PostgreSQL）にのみ保存されます。`message_id` (IMAPのMessage-ID) と `server_config_id` の組み合わせでメールを識別します。

### バックエンドAPI設計 (.NET)

#### Models/Label.cs

```csharp
public class Label
{
    public Guid Id { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Color { get; set; } = "#3B82F6";
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
```

#### Models/MailLabel.cs

```csharp
public class MailLabel
{
    public Guid Id { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string MessageId { get; set; } = string.Empty;
    public Guid LabelId { get; set; }
    public Guid ServerConfigId { get; set; }
    public DateTime CreatedAt { get; set; }
}
```

#### Controllers/LabelsController.cs

エンドポイント:
- `GET /api/labels` - ユーザーのラベル一覧取得
- `POST /api/labels` - ラベル作成
- `PUT /api/labels/{id}` - ラベル更新
- `DELETE /api/labels/{id}` - ラベル削除
- `GET /api/labels/{id}/messages` - 特定ラベルのメール一覧取得
- `POST /api/labels/{id}/messages` - メールにラベル付与
- `DELETE /api/labels/{id}/messages/{messageId}` - メールからラベル削除

### フロントエンド設計 (React + TypeScript)

#### 新規コンポーネント

1. **LabelManager.tsx**
   - ラベル一覧表示（カード型）
   - ラベル作成/編集モーダル呼び出し
   - ラベル削除確認

2. **LabelModal.tsx**
   - ラベル作成/編集用モーダル
   - 名前入力、カラーピッカー
   - バリデーション

3. **LabelBadge.tsx**
   - メールに付与されたラベルの表示用バッジ
   - クリックでフィルタリング
   - ×ボタンで削除

4. **LabelSelector.tsx**
   - メールにラベルを付与するドロップダウン
   - 既存ラベルの選択
   - 新規ラベル作成へのショートカット

#### 既存コンポーネントの修正

1. **DashboardPage.tsx**
   - サイドバーにラベル一覧セクション追加
   - ラベルクリックでフィルタリング
   - メールリストにラベルバッジ表示

2. **MailDetailModal.tsx**
   - ラベルセレクター追加
   - 現在付与されているラベル表示

3. **SettingsPage.tsx**
   - ラベル管理タブ追加（または独立ページ）

#### 型定義 (src/types/label.ts)

```typescript
export interface Label {
  id: string; // UUID
  userId: string;
  name: string;
  color: string; // HEX color
  createdAt: string;
  updatedAt: string;
}

export interface MailLabel {
  id: string; // UUID
  userId: string;
  messageId: string;
  labelId: string;
  serverConfigId: string;
  createdAt: string;
}

export interface LabelWithCount extends Label {
  messageCount: number; // メール数（フロントエンド計算）
}
```

## 実装順序

### Phase 1: データベース基盤 (Day 1)
1. マイグレーションSQLファイル作成
2. データベースに適用・検証
3. C# Modelクラス作成

### Phase 2: バックエンドAPI (Day 2-3)
1. `LabelsController` 実装
2. ShuitNet.ORMでCRUD操作実装
3. ユーザー認証・認可確認
4. エラーハンドリング追加

### Phase 3: フロントエンド基礎 (Day 4-5)
1. API通信関数実装 (`src/lib/api.ts`)
2. 型定義作成
3. `LabelModal` 実装（作成/編集）
4. `LabelManager` 実装（一覧・削除）

### Phase 4: UI統合 (Day 6-7)
1. `LabelBadge`, `LabelSelector` 実装
2. `DashboardPage` にラベル表示追加
3. `MailDetailModal` にラベル操作追加
4. サイドバーにラベル一覧追加

### Phase 5: テスト・改善 (Day 8)
1. 動作確認
2. UI/UX改善
3. パフォーマンス最適化
4. ドキュメント更新

## UI/UXデザイン方針

### カラーパレット
- デフォルトカラー: 12色のプリセット（青、緑、赤、黄、紫など）
- カスタムカラーピッカー対応

### ラベル表示
- Pill型バッジ（丸み帯びた矩形）
- ラベル色を背景色として使用、文字は白or黒（コントラスト考慮）
- ホバー時に×ボタン表示（削除用）

### サイドバーラベル一覧
- アイコン: タグアイコン + カラードット
- メール件数を右側に表示
- アクティブラベルをハイライト

## セキュリティ考慮事項

1. **認可チェック**: すべてのAPI呼び出しで `UserId` (JWT `sub`) を検証
2. **SQL Injection対策**: ShuitNet.ORMのパラメータ化クエリ使用
3. **XSS対策**: ラベル名のサニタイゼーション（React自動エスケープ）
4. **UUID使用**: ラベルIDは推測困難なUUID

## パフォーマンス最適化

1. **インデックス**: `labels(user_id)`, `mail_labels(user_id, label_id, message_id)`
2. **ページネーション**: ラベル付きメール一覧も20件ずつ
3. **キャッシュ**: フロントエンドでラベル一覧をキャッシュ（Context API / Zustand）

## 将来拡張

- [ ] ドラッグ&ドロップでのラベル付与
- [ ] スマートラベル（自動ラベル付け）
- [ ] ラベルの階層化（親子関係）
- [ ] 複数ラベルのAND/OR検索
- [ ] ラベルごとの通知設定

## ブランチ戦略

- ブランチ名: `feature/labels`
- コミットプレフィックス:
  - `feat(labels): ...` - 新機能
  - `fix(labels): ...` - バグ修正
  - `refactor(labels): ...` - リファクタリング
  - `docs(labels): ...` - ドキュメント
- マージ先: `main`

## チェックリスト

- [ ] データベーススキーマ作成
- [ ] C# Models作成
- [ ] LabelsController API実装
- [ ] フロントエンド型定義作成
- [ ] LabelModal コンポーネント実装
- [ ] LabelManager コンポーネント実装
- [ ] LabelBadge コンポーネント実装
- [ ] LabelSelector コンポーネント実装
- [ ] DashboardPage更新
- [ ] MailDetailModal更新
- [ ] 動作確認・テスト
- [ ] CLAUDE.md更新

## 備考

- IMAP仕様上、ラベル情報はサーバー側に保存できないため、ローカルDBに保存
- メールの`Message-ID`ヘッダーをキーとして使用（RFC 5322準拠）
- 同期問題: メールがサーバー側で削除された場合、`mail_labels`の孤立レコードが残る可能性あり（将来的にクリーンアップジョブ検討）
