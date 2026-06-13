# カスタムアクション機能 実装計画書

## 機能概要

メール本文中の特定のパターン（ワンタイムコード、認証コード、追跡番号など）を自動検出し、検出された文字列の横にコピーボタンを設置する機能。

### ユースケース例

1. **ワンタイムパスワード (OTP)**
   - パターン: `123456`, `000-000`, `ABC-123`
   - 検出例: "認証コード: 123456" → 「123456」にコピーボタン

2. **確認コード**
   - パターン: 6桁数字、英数字混合
   - 検出例: "Your code is ABC123" → 「ABC123」にコピーボタン

3. **追跡番号**
   - パターン: `1234-5678-9012`, `ABC123456789`
   - 検出例: "お問い合わせ番号: 1234-5678-9012" → コピーボタン

4. **トークン・API キー**
   - パターン: 長い英数字文字列
   - 検出例: "Token: eyJhbGciOiJIUzI1..." → コピーボタン

---

## アーキテクチャ設計

### システム構成

```
┌─────────────────────────────────────────────────┐
│           カスタムアクション機能                │
├─────────────────────────────────────────────────┤
│                                                 │
│  1. パターン定義 (Backend)                      │
│     ├─ custom_action_patterns テーブル         │
│     └─ パターン管理API                          │
│                                                 │
│  2. メール表示 (Frontend)                       │
│     ├─ パターンマッチング処理                   │
│     ├─ コピーボタン生成                         │
│     └─ クリップボードAPI                        │
│                                                 │
│  3. 実行履歴 (Optional)                         │
│     ├─ アクション実行ログ                       │
│     └─ 統計情報                                 │
│                                                 │
└─────────────────────────────────────────────────┘
```

### データフロー

```
1. ユーザーがメールを開く
   ↓
2. メール本文を取得
   ↓
3. 定義済みパターンで本文をスキャン
   ↓
4. マッチした文字列を特定
   ↓
5. コピーボタンを含むHTML要素に変換
   ↓
6. レンダリング
   ↓
7. ユーザーがボタンクリック
   ↓
8. クリップボードにコピー
   ↓
9. トースト通知表示
```

---

## データモデル

### Backend: custom_action_patterns テーブル

```sql
CREATE TABLE custom_action_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL,  -- Cognito sub
    pattern_name VARCHAR(100) NOT NULL,  -- "6桁数字", "追跡番号" など
    pattern_type VARCHAR(50) NOT NULL,   -- "otp", "tracking", "token", "custom"
    regex_pattern TEXT NOT NULL,         -- 正規表現パターン
    action_type VARCHAR(50) NOT NULL,    -- "copy", "link", "highlight"
    priority INT DEFAULT 0,              -- 優先度 (高い方が先に評価)
    is_enabled BOOLEAN DEFAULT true,     -- 有効/無効
    description TEXT,                    -- パターンの説明
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_custom_action_patterns_user ON custom_action_patterns(user_id);
CREATE INDEX idx_custom_action_patterns_enabled ON custom_action_patterns(user_id, is_enabled);
```

### Backend: C# モデル

```csharp
public class CustomActionPattern
{
    public Guid Id { get; set; }
    public string UserId { get; set; }
    public string PatternName { get; set; }
    public string PatternType { get; set; }
    public string RegexPattern { get; set; }
    public string ActionType { get; set; }
    public int Priority { get; set; } = 0;
    public bool IsEnabled { get; set; } = true;
    public string? Description { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
```

### Frontend: TypeScript 型定義

```typescript
export interface CustomActionPattern {
  id: string;
  userId: string;
  patternName: string;
  patternType: 'otp' | 'tracking' | 'token' | 'custom';
  regexPattern: string;
  actionType: 'copy' | 'link' | 'highlight';
  priority: number;
  isEnabled: boolean;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PatternMatch {
  value: string;           // マッチした文字列
  pattern: CustomActionPattern;  // 使用されたパターン
  startIndex: number;      // 開始位置
  endIndex: number;        // 終了位置
}
```

---

## 実装フェーズ

### Phase 1: バックエンド基盤 (2-3時間)

#### 1.1 データベース
- [ ] マイグレーションファイル作成
- [ ] `custom_action_patterns` テーブル作成
- [ ] インデックス作成

#### 1.2 モデルとコントローラー
- [ ] `CustomActionPattern` モデル作成
- [ ] `CustomActionPatternsController` 作成
  - `GET /api/customactionpatterns` - パターン一覧取得
  - `POST /api/customactionpatterns` - パターン作成
  - `PUT /api/customactionpatterns/{id}` - パターン更新
  - `DELETE /api/customactionpatterns/{id}` - パターン削除
  - `POST /api/customactionpatterns/{id}/toggle` - 有効/無効切り替え

#### 1.3 デフォルトパターン
- [ ] システムデフォルトパターンを定義
  - 6桁数字 OTP: `\b\d{6}\b`
  - 8桁数字 OTP: `\b\d{8}\b`
  - 英数字混合コード: `\b[A-Z0-9]{6,8}\b`
  - ハイフン区切り: `\b\d{3}-\d{3}\b`, `\b[A-Z]{3}-\d{3}\b`
  - 追跡番号: `\b\d{4}-\d{4}-\d{4}\b`
  - トークン/UUID: `\b[a-f0-9]{32}\b`, `\b[a-f0-9-]{36}\b`

---

### Phase 2: フロントエンド - パターンマッチング (2-3時間)

#### 2.1 パターン管理API
- [ ] `src/lib/api.ts` にAPI関数追加
  - `getCustomActionPatterns()`
  - `createCustomActionPattern()`
  - `updateCustomActionPattern()`
  - `deleteCustomActionPattern()`
  - `toggleCustomActionPattern()`

#### 2.2 パターンマッチングエンジン
- [ ] `src/utils/patternMatcher.ts` 作成
  ```typescript
  export function findPatternMatches(
    text: string,
    patterns: CustomActionPattern[]
  ): PatternMatch[]
  ```
- [ ] 正規表現マッチング処理
- [ ] 優先度に基づく重複処理
- [ ] パフォーマンス最適化（メモ化）

#### 2.3 メール本文レンダリング
- [ ] `src/components/EnhancedMailContent.tsx` 作成
- [ ] プレーンテキストのHTML変換
- [ ] マッチした文字列をボタン付き要素に置換
- [ ] HTML メールの場合の処理

---

### Phase 3: フロントエンド - コピーボタンUI (1-2時間)

#### 3.1 コピーボタンコンポーネント
- [ ] `src/components/CopyButton.tsx` 作成
  - クリップボードAPI使用
  - コピー成功時のフィードバック（アニメーション）
  - トースト通知
  - アクセシビリティ対応（aria-label）

#### 3.2 スタイリング
- [ ] ボタンデザイン（アイコン + ホバー効果）
- [ ] インラインボタンの配置
- [ ] レスポンシブ対応

#### 3.3 統合
- [ ] `MailDetailModal.tsx` に統合
- [ ] DashboardPage のプレビューに統合

---

### Phase 4: パターン管理UI (2-3時間)

#### 4.1 設定ページ
- [ ] `src/pages/CustomActionsPage.tsx` 作成
- [ ] パターン一覧表示
- [ ] パターンカードコンポーネント

#### 4.2 パターン編集モーダル
- [ ] `src/components/CustomActionPatternModal.tsx` 作成
  - パターン名入力
  - 正規表現入力
  - パターンタイプ選択
  - アクションタイプ選択
  - 優先度設定
  - テストプレビュー機能（サンプルテキストでマッチング確認）

#### 4.3 ナビゲーション
- [ ] サイドバーにメニュー追加
- [ ] ルーティング設定

---

### Phase 5: 拡張機能 (Optional, 2-3時間)

#### 5.1 追加のアクションタイプ
- [ ] **リンク生成**: URLパターンテンプレート
  - 例: 追跡番号 → `https://tracking.example.com/{value}`
- [ ] **ハイライト**: 重要な情報を強調表示
- [ ] **カスタムアクション**: JavaScript 実行（高度）

#### 5.2 統計・分析
- [ ] パターンマッチング頻度の記録
- [ ] コピーボタン使用統計
- [ ] 人気パターンの表示

#### 5.3 プリセットパターン
- [ ] よく使われるパターンのテンプレート集
- [ ] ワンクリックでインポート

---

## 技術的な考慮事項

### セキュリティ

1. **正規表現 DoS 攻撃対策**
   - タイムアウト設定（1秒以内）
   - 複雑度チェック
   - サンドボックス実行

2. **XSS 対策**
   - HTML サニタイゼーション（DOMPurify使用）
   - 安全なHTML生成

3. **プライバシー**
   - パターンマッチングはクライアント側のみ
   - マッチした値をサーバーに送信しない

### パフォーマンス

1. **正規表現の最適化**
   - コンパイル済み正規表現をキャッシュ
   - 短いパターンを優先評価

2. **レンダリング最適化**
   - 仮想スクロール（長いメール）
   - 遅延レンダリング
   - React.memo 使用

3. **大量パターン対策**
   - パターン数制限（ユーザーあたり50個まで）
   - 無効なパターンのスキップ

### ユーザビリティ

1. **視覚的フィードバック**
   - コピー成功時のアニメーション
   - トースト通知
   - ボタンホバー時のツールチップ

2. **アクセシビリティ**
   - キーボード操作対応
   - スクリーンリーダー対応
   - ARIA属性

3. **エラーハンドリング**
   - 無効な正規表現の検出
   - ユーザーへのフィードバック
   - デバッグモード（開発者向け）

---

## マイルストーン

### Sprint 1 (1週間)
- Phase 1: バックエンド基盤完了
- Phase 2: パターンマッチング実装完了
- 基本的なコピー機能のデモ

### Sprint 2 (1週間)
- Phase 3: コピーボタンUI完成
- Phase 4: パターン管理UI完成
- エンドツーエンドテスト

### Sprint 3 (Optional, 1週間)
- Phase 5: 拡張機能実装
- パフォーマンスチューニング
- ドキュメント作成

---

## リスクと対策

| リスク | 影響 | 対策 |
|--------|------|------|
| 正規表現の複雑さによるパフォーマンス低下 | 高 | タイムアウト、複雑度チェック |
| 誤検出（False Positive） | 中 | パターンの精度向上、テストケース追加 |
| HTML メールでのレンダリング崩れ | 中 | HTML パーサーの改善、フォールバック |
| ユーザーが大量のパターンを作成 | 低 | 上限設定（50個）、警告表示 |
| クリップボードAPI の非対応ブラウザ | 低 | フォールバック実装（execCommand） |

---

## 成功指標 (KPI)

1. **機能採用率**: 30日以内に50%のユーザーが機能を使用
2. **コピー成功率**: 95%以上
3. **パターン作成数**: アクティブユーザーあたり平均3個
4. **レスポンス速度**: パターンマッチング処理が100ms以内
5. **ユーザー満足度**: フィードバック調査で4.5/5以上

---

## 次のステップ

1. この計画書をレビュー
2. 必要に応じて調整
3. Phase 1 から実装開始
4. 各フェーズ完了後にデモ・レビュー

---

## 参考資料

- [Clipboard API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API)
- [Regular Expression Best Practices](https://www.regular-expressions.info/catastrophic.html)
- [DOMPurify - HTML Sanitization](https://github.com/cure53/DOMPurify)
- [React Performance Optimization](https://react.dev/learn/render-and-commit)
