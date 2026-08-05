# MailDeck

複数の外部IMAPアカウントを統合管理できる、AWS Cognito認証を使用したモダンなWebメールプラットフォーム。

## 概要

MailDeckは、ユーザーが複数のメールアカウントを統合インターフェースから管理できるフルスタックWebメールアプリケーションです。最新技術で構築され、Cloudflareインフラでデプロイされています。

### 主な機能

- **マルチアカウント管理**: 複数のIMAP/SMTPアカウントを接続・管理
- **Gmail連携 (OAuth2)**: Googleアカウントでログインするだけで追加 (アプリパスワード不要)
- **セキュアな認証**: AWS Cognito + JWTトークンによるユーザー認証
- **メール操作**: すべてのアカウント間でメールの読み取り、送信、整理が可能
- **リアルタイム通知**: 新着メールのWeb Push通知
- **連絡先管理**: 組み込み連絡先データベース
- **レスポンシブデザイン**: デスクトップとモバイルでシームレスに動作

### 技術スタック

**フロントエンド**
- React 19 + TypeScript
- Viteビルドシステム
- TailwindCSSによるスタイリング
- AWS Amplify UI (認証)
- Cloudflare Pagesでホスト

**バックエンド**
- ASP.NET Core (.NET 8.0) Web API
- MailKit (IMAP/SMTP操作)
- PostgreSQL + ShuitNet.ORM
- Serilog (構造化ログ)
- Cloudflare Tunnel経由でホスト

**インフラ**
- AWS Cognito (ユーザー認証)
- AWS KMS (認証情報暗号化)
- Terraform (Infrastructure as Code)

## アーキテクチャ

```
ユーザー (ブラウザ)
    ↓ HTTPS
Cloudflare Pages (Frontend) ↔ Cloudflare Tunnel ↔ ASP.NET Core API
    ↓                                                    ↓
AWS Cognito (認証)                          PostgreSQL (ShuitNet.ORM)
    ↓                                                    ↓
外部 IMAP/SMTP サーバー
```

### セキュリティ機能

- **認証情報の暗号化**: すべてのIMAP/SMTPパスワードをAWS KMSで暗号化
- **UUIDベースのID**: 連続IDではなくUUIDを使用し列挙攻撃を防止
- **JWT認証**: すべてのAPIリクエストにCognito発行のJWTトークンが必要
- **SSL/TLS強制**: すべてのメール接続で安全なプロトコルを使用
- **CORS保護**: 認可されたフロントエンドドメインのみAPIアクセス可能

## セットアップ

### 前提条件

- Node.js 18+ と npm
- .NET 8.0 SDK
- PostgreSQL 14+
- AWSアカウント (Cognito と KMS アクセス)
- Terraform (インフラセットアップ用)

### インフラのセットアップ

1. Terraformを使用してAWSリソースをセットアップ:

```bash
cd infrastructure/terraform
terraform init
terraform plan
terraform apply
```

これにより以下が作成されます:
- AWS Cognito User Pool
- AWS KMS暗号化キー
- 必要なIAMポリシー

2. 出力値 (User Pool ID, Client ID, KMS Key ARN) を設定用にメモします。

### データベースのセットアップ

1. PostgreSQLデータベースを作成:

```bash
createdb maildeck
```

2. マイグレーションを実行:

```bash
psql -d maildeck -f database/001_initial_schema.sql
psql -d maildeck -f database/002_uuid_migration.sql
```

### バックエンドの設定

1. バックエンドディレクトリに移動:

```bash
cd MailDeck.Api
```

2. `.env`ファイルを作成し、必要な変数を設定:

```bash
# AWS設定
AWS_REGION=us-west-2
KMS_KEY_ID=<KMS-ARN>
COGNITO_USER_POOL_ID=<User-Pool-ID>
COGNITO_CLIENT_ID=<Client-ID>

# データベース
POSTGRES_CONNECTION_STRING=Host=localhost;Database=maildeck;Username=postgres;Password=<password>

# Web Push (VAPID) - web-pushライブラリで生成
VAPID_PUBLIC_KEY=<公開鍵>
VAPID_PRIVATE_KEY=<秘密鍵>
VAPID_SUBJECT=mailto:admin@example.com

# Google OAuth2 (Gmail連携) - 任意。未設定の場合はパスワード認証のみ利用可能
# 取得手順: docs/operations/gmail-oauth-setup.md
OAuth__Google__ClientId=<OAuthクライアントID>
OAuth__Google__ClientSecret=<クライアントシークレット>
OAuth__Google__RedirectUri=https://maildeck.example.com/api/oauth/google/callback
```

3. バックエンドを起動:

```bash
dotnet restore
dotnet run
```

APIは `http://localhost:5000` で起動します。

### フロントエンドの設定

1. フロントエンドディレクトリに移動:

```bash
cd maildeck-ui
```

2. 依存関係をインストール:

```bash
npm install
```

3. `.env.local`ファイルを作成:

```bash
VITE_API_URL=http://localhost:5000
VITE_COGNITO_USER_POOL_ID=<User-Pool-ID>
VITE_COGNITO_CLIENT_ID=<Client-ID>
VITE_COGNITO_REGION=us-west-2
VITE_VAPID_PUBLIC_KEY=<VAPID公開鍵>
```

4. 開発サーバーを起動:

```bash
npm run dev
```

フロントエンドは `http://localhost:5173` で起動します。

## 開発

### フロントエンド開発

```bash
cd maildeck-ui

# ホットリロード付き開発サーバー起動
npm run dev

# 本番ビルド
npm run build

# コードのLint
npm run lint

# 本番ビルドのプレビュー
npm run preview
```

### バックエンド開発

```bash
cd MailDeck.Api

# ホットリロードで実行
dotnet watch run

# プロジェクトをビルド
dotnet build

# テスト実行 (テストプロジェクトが用意されたら)
dotnet test
```

### コーディング規約

**TypeScript/React**
- TypeScript strict mode有効
- React 19 Hooksパターン使用
- 認証済みAPI呼び出しは `src/lib/api.ts` の `authFetch` を使用
- すべてのリソースIDはUUID (string型)

**C#/.NET**
- Nullable参照型有効
- すべてのI/O操作でasync/await使用
- 新規UUIDには `Guid.NewGuid()` を使用
- データベース操作はShuitNet.ORM使用
- ログはSerilogで構造化

## デプロイ

### systemdによる本番デプロイ

プロジェクトには本番デプロイ用のsystemdサービスファイルが含まれています:

```bash
# バックエンドAPI起動
sudo systemctl start maildeck-api

# フロントエンド起動 (ローカルで配信する場合)
sudo systemctl start maildeck-ui

# 両方のサービス起動
sudo systemctl start maildeck.target

# 起動時に自動起動を有効化
sudo systemctl enable maildeck-api
sudo systemctl enable maildeck-ui
```

### Cloudflare Pagesデプロイ

1. フロントエンドをビルド:

```bash
cd maildeck-ui
npm run build
```

2. `dist/` ディレクトリをCloudflare Pagesにデプロイ

3. Cloudflare Pagesダッシュボードで環境変数を設定:
   - `VITE_API_URL`
   - `VITE_COGNITO_USER_POOL_ID`
   - `VITE_COGNITO_CLIENT_ID`
   - `VITE_COGNITO_REGION`
   - `VITE_VAPID_PUBLIC_KEY`

## APIドキュメント

### 認証

すべてのAPIエンドポイントはAWS Cognito経由のJWT認証が必要です:

```
Authorization: Bearer <cognito-jwt-token>
```

### 主要エンドポイント

| エンドポイント | メソッド | 説明 |
|---------------|----------|------|
| `/api/mail/inbox` | GET | 受信箱取得 (ページネーション対応) |
| `/api/mail/message/{id}` | GET | メール詳細取得 |
| `/api/mail/send` | POST | メール送信 |
| `/api/serverconfig` | GET | IMAPアカウント一覧 |
| `/api/serverconfig` | POST | IMAPアカウント追加 |
| `/api/serverconfig/{id}` | PUT | IMAPアカウント更新 |
| `/api/serverconfig/{id}` | DELETE | IMAPアカウント削除 |
| `/api/serverconfig/autoconfig` | POST | メール設定自動検出 |
| `/api/oauth/providers` | GET | 利用可能なOAuthプロバイダ一覧 |
| `/api/oauth/google/authorize` | POST | Google同意画面URLの発行 |
| `/api/oauth/google/callback` | GET | Googleからのリダイレクト受け口 |
| `/api/contacts` | GET | 連絡先一覧 |
| `/api/contacts` | POST | 連絡先作成 |
| `/api/contacts/{id}` | PUT | 連絡先更新 |
| `/api/webpush/subscribe` | POST | Push通知登録 |

## プロジェクト構造

```
MailDeck/
├── MailDeck.Api/              # ASP.NET Coreバックエンド
│   ├── Controllers/           # APIエンドポイント
│   ├── Services/              # ビジネスロジック
│   ├── Middleware/            # カスタムミドルウェア
│   └── Models/                # データモデル
├── maildeck-ui/               # Reactフロントエンド
│   ├── src/
│   │   ├── pages/             # ページコンポーネント
│   │   ├── components/        # 再利用可能コンポーネント
│   │   └── lib/               # ユーティリティとAPIクライアント
│   └── dist/                  # ビルド出力
├── database/                  # SQLマイグレーション
├── infrastructure/            # Terraform設定
└── systemd/                   # サービスファイル
```

## バックグラウンドサービス

### メールチェックサービス

`EmailCheckBackgroundService` が定期的に新着メールをチェックします:

- **本番環境**: 10分毎
- **開発環境**: 1分毎

新着メールがあると、登録されたデバイスにWeb Push通知が送信されます。

## ログ

Serilogが3種類のJSONログを日次ローテーション (7日保持) で生成します:

1. **logs/requests-{Date}.json**: HTTPリクエスト/レスポンスログ
2. **logs/performance-{Date}.json**: パフォーマンスメトリクス
3. **logs/maildeck-{Date}.json**: アプリケーションログ

## トラブルシューティング

### IMAP接続エラー

1. `user_server_configs` テーブルの認証情報を確認
2. `logs/maildeck-{Date}.json` でMailKit例外を確認
3. SSL/TLSポートを確認 (IMAP: 993, SMTP: 465/587)

### JWT認証の失敗

1. `appsettings.json` のCognito設定を確認
2. `TokenLoggingMiddleware` ログを確認
3. Cognito User Poolのアプリクライアント設定を確認

### Web Push通知が届かない

1. `/api/webpush/subscribe` でサブスクリプションを確認
2. `.env` のVAPIDキーを確認
3. `EmailCheckBackgroundService` ログを確認

## 貢献

個人プロジェクトですが、提案やバグレポートはGitHub Issuesで歓迎します。

## ライセンス

このプロジェクトはプロプライエタリであり、公開利用のライセンスはありません。

## 追加ドキュメント

- [CLAUDE.md](CLAUDE.md) - Claude Code向け詳細開発ガイド
- [database/UUID_MIGRATION_README.md](database/UUID_MIGRATION_README.md) - UUID移行の詳細
