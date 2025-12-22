# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

**MailDeck**は、AWS Cognito認証を使用し、複数の外部IMAPアカウントを統合管理できるWebメールプラットフォームです。

- **フロントエンド**: React 19 + TypeScript + Vite (Cloudflare Pagesにホスト)
- **バックエンド**: ASP.NET Core (.NET 10.0) Web API (自宅サーバーでCloudflare Tunnel経由)
- **データベース**: PostgreSQL + ShuitNet.ORM
- **認証**: AWS Cognito User Pool
- **メール**: MailKit (IMAP/SMTP)

## 開発コマンド

### フロントエンド (maildeck-ui/)

```bash
# 開発サーバー起動
npm run dev

# ビルド (TypeScriptコンパイル + Viteビルド)
npm run build

# Lint
npm run lint

# プレビュー
npm run preview
```

### バックエンド (MailDeck.Api/)

```bash
# 開発サーバー起動 (ホットリロード)
dotnet run

# ビルド
dotnet build

# 本番環境起動
dotnet run --launch-profile MailDeck.Api

# テスト実行 (現在テストプロジェクトなし)
```

### Terraform (infrastructure/terraform/)

```bash
# 初期化
terraform init

# プラン確認
terraform plan

# 適用 (AWS Cognito + KMS作成)
terraform apply
```

## アーキテクチャ

### 3層アーキテクチャ

```
ユーザー (ブラウザ)
    ↓ HTTPS
Cloudflare Pages (Frontend) ↔ Cloudflare Tunnel ↔ ASP.NET Core API
    ↓                                                    ↓
AWS Cognito (認証)                          PostgreSQL (ShuitNet.ORM)
    ↓                                                    ↓
外部 IMAP/SMTP サーバー
```

### 認証フロー

1. ユーザーがAmplify UIでCognitoにログイン
2. CognitoがJWTトークン発行
3. フロントエンドが`Authorization: Bearer <token>`ヘッダーでAPI呼び出し
4. バックエンドがJWT検証 (`TokenLoggingMiddleware`でログ記録)
5. トークンの`sub`クレームをユーザーID (`UserId`) として使用

### メール操作フロー

1. **アカウント追加**: `/api/serverconfig` POST → AWS KMSで認証情報暗号化 → PostgreSQL保存
2. **メール取得**: `/api/mail/inbox` GET → KMSで復号化 → IMAP接続 → 20件ページネーション
3. **メール送信**: `/api/mail/send` POST → SMTP経由送信
4. **バックグラウンドチェック**: `EmailCheckBackgroundService` が10分毎 (本番) / 1分毎 (開発) に新着確認 → Web Pushで通知

### データモデル

#### users テーブル
- Cognitoユーザープロファイルの補完データ
- PK: Cognito `sub` (VARCHAR)

#### user_server_configs テーブル
- IMAPアカウント設定
- **PK: UUID** (推測困難なID、セキュリティ向上のため2024年にSERIALから移行)
- **重要**: `imap_password`, `smtp_password` は AWS KMS暗号化
- `last_known_uid`: 効率的な新着チェック用
- `last_checked_at`: 最終チェック時刻

#### contacts テーブル
- ユーザーの連絡先管理
- **PK: UUID** (推測困難なID)
- `user_id` 外部キー

#### web_push_subscriptions テーブル
- Web Pushエンドポイント
- **PK: UUID** (推測困難なID)
- `auth`, `p256dh` 暗号化

## コーディング規約

### C# バックエンド

- **Nullable有効**: `<Nullable>enable</Nullable>`
- **Implicit Usings**: 共通名前空間は自動インポート
- **非同期パターン**: すべてのI/O操作で`async/await`使用
- **UUID生成**: 新規レコード作成時は `Guid.NewGuid()` でUUID生成 (user_server_configs, contacts, web_push_subscriptions)
- **認証情報マスク**: APIレスポンスでパスワードを`*****`に置換 ([ServerConfigController.cs:82-101](MailDeck.Api/Controllers/ServerConfigController.cs#L82-L101))
- **エラーハンドリング**: 例外は500エラーで返し、詳細ログをSerilogで記録

### TypeScript フロントエンド

- **TypeScript 5.9**: Strict mode
- **React 19**: 最新のHooks使用
- **API呼び出し**: `src/lib/api.ts` の `authFetch` 使用 (自動JWT認証ヘッダー付与)
- **型安全性**: すべてのAPIレスポンスに型定義
- **UUID型**: すべてのリソースID (アカウント、連絡先) は `string` 型でUUID形式

### ログ戦略

Serilogで3種類のJSONログを日次ローテーション (7日保持):

1. **logs/requests-{Date}.json**: HTTPリクエスト/レスポンス
2. **logs/performance-{Date}.json**: パフォーマンスメトリクス
3. **logs/maildeck-{Date}.json**: アプリケーションログ

エンリッチメント: マシン名, 環境, トレースID, スパンID

## セキュリティ

### 認証情報の保護

- **保存**: AWS KMS (`KmsEncryptionService`) で暗号化
- **通信**: IMAP/SMTP接続は常にSSL/TLS強制
- **トークン**: JWT BearerトークンをCognitoで検証
- **CORS**: フロントエンドドメインのみ許可

### 環境変数 (.env)

```bash
# AWS設定
AWS_REGION=us-west-2
KMS_KEY_ID=<KMS ARN>
COGNITO_USER_POOL_ID=<Pool ID>
COGNITO_CLIENT_ID=<Client ID>

# データベース
POSTGRES_CONNECTION_STRING=<接続文字列>

# Web Push (VAPID)
VAPID_PUBLIC_KEY=<公開鍵>
VAPID_PRIVATE_KEY=<秘密鍵>
VAPID_SUBJECT=mailto:admin@example.com
```

## デプロイメント

### systemd サービス

```bash
# バックエンド起動
sudo systemctl start maildeck-api

# フロントエンド起動
sudo systemctl start maildeck-ui

# 両方起動
sudo systemctl start maildeck.target

# ステータス確認
sudo systemctl status maildeck-api
```

### Cloudflare Pages

1. `maildeck-ui/` で `npm run build`
2. `dist/` ディレクトリをCloudflare Pagesにデプロイ
3. 環境変数 `VITE_API_URL` をバックエンドURLに設定

## ディレクトリ構造の注意点

### バックエンド (MailDeck.Api/)

- **Controllers/**: 5つのコントローラー (Mail, ServerConfig, Users, Contacts, WebPush)
- **Services/**: ビジネスロジック
  - `EmailCheckBackgroundService`: バックグラウンド新着チェック
  - `KmsEncryptionService`: AWS KMS暗号化/復号化ラッパー
- **Middleware/**: `TokenLoggingMiddleware` (JWT監査ログ)
- **Models/**: データモデル (ShuitNet.ORMエンティティ)

### フロントエンド (maildeck-ui/src/)

- **pages/**: ページコンポーネント
  - `LoginPage.tsx`: Cognito認証
  - `DashboardPage.tsx`: メール受信箱 (リロードボタンあり、タブ切り替えで `'all'` または UUID)
  - `SettingsPage.tsx`: IMAPアカウント設定 (モーダルベースのUI)
  - `ContactsPage.tsx`: 連絡先管理
- **components/**: 再利用可能UI
  - `MailDetailModal.tsx`: メール詳細ビューア
  - `ComposeModal.tsx`: メール作成
  - `ContactModal.tsx`: 連絡先編集
  - `ServerConfigModal.tsx`: メールアカウント追加/編集モーダル
- **lib/api.ts**: 認証済みAPI呼び出しラッパー

## 重要な実装詳細

### UUID vs SERIAL

このプロジェクトでは、セキュリティ向上のため、リソースIDにUUIDを使用:
- **推測攻撃の防止**: 連続したIDではなくランダムなUUID
- **情報漏洩の防止**: システム規模やレコード数の推測が困難
- **列挙攻撃の防止**: 順次スキャンが実質的に不可能

UUID移行の詳細は [database/UUID_MIGRATION_README.md](database/UUID_MIGRATION_README.md) を参照。

### IMAP/SMTP接続管理

- **MailKit使用**: 各API呼び出しで接続/切断 (現在接続プールなし)
- **SSL/TLS強制**: `SecureSocketOptions.SslOnConnect` または `StartTls`
- **タイムアウト**: デフォルト値 (必要に応じて調整)

### ShuitNet.ORM使用法

```csharp
// SELECT
var configs = await db.SelectAsync<UserServerConfig>(
    "WHERE user_id = @UserId",
    new { UserId = userId }
);

// INSERT
await db.InsertAsync(config);

// UPDATE
await db.UpdateAsync(config);

// DELETE
await db.DeleteAsync<UserServerConfig>(config.Id);
```

### レスポンシブデザイン

- **ブレークポイント**: Tailwind `md:` (768px)
- **モバイル**: サイドバー非表示、ハンバーガーメニュー
- **デスクトップ**: サイドバー常時表示
- **モーダル**: モバイルでフルスクリーン、デスクトップで中央配置

### UI/UXパターン

- **モーダルベース編集**: メールアカウント設定や連絡先編集はモーダルで実施
  - 編集中であることが明確
  - 設定項目がセクション分けされて整理されている
  - IMAP/SMTP設定が視覚的に区別されている
- **カード型一覧**: アカウントや連絡先はカード型で表示
  - ホバー時のハイライト効果
  - アイコンで視認性向上

## トラブルシューティング

### IMAP接続エラー

1. `user_server_configs` テーブルの認証情報確認
2. ログ `logs/maildeck-{Date}.json` でMailKit例外確認
3. サーバー設定でSSL/TLSポート確認 (IMAP: 993, SMTP: 465/587)

### JWT検証失敗

1. `appsettings.json` の `CognitoAuthority`, `CognitoClientId` 確認
2. `TokenLoggingMiddleware` ログでトークン内容確認
3. Cognito User Poolのアプリクライアント設定確認

### Web Push通知が届かない

1. `/api/webpush/subscribe` でサブスクリプション登録確認
2. `.env` のVAPIDキー確認
3. `EmailCheckBackgroundService` ログ確認

## API エンドポイント一覧

| エンドポイント | メソッド | 説明 |
|---------------|----------|------|
| `/api/mail/inbox` | GET | 受信箱取得 (ページネーション: `page`, `pageSize`) |
| `/api/mail/message/{id}` | GET | メール詳細取得 |
| `/api/mail/send` | POST | メール送信 |
| `/api/serverconfig` | GET | IMAPアカウント一覧 |
| `/api/serverconfig` | POST | IMAPアカウント追加 |
| `/api/serverconfig/{id}` | PUT | IMAPアカウント更新 |
| `/api/serverconfig/{id}` | DELETE | IMAPアカウント削除 |
| `/api/serverconfig/autoconfig` | POST | Thunderbird風自動設定検出 |
| `/api/users/sync` | POST | ユーザー同期 |
| `/api/contacts` | GET/POST | 連絡先一覧/追加 |
| `/api/contacts/{id}` | PUT | 連絡先更新 |
| `/api/webpush/subscribe` | POST | Web Push登録 |
