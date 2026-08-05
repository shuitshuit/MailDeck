# Gmail連携 (OAuth2) のセットアップ

MailDeckはGmailを2通りの方法で受信できる。

| 方式 | 必要なもの | 備考 |
|------|-----------|------|
| **OAuth2 (推奨)** | サーバー側にGoogle OAuthクライアント | ユーザーはGoogleでログインするだけ |
| パスワード認証 | ユーザーごとにアプリパスワード | Googleの2段階認証が必須 |

Googleは2022年5月に「安全性の低いアプリのアクセス」を廃止したため、通常のGoogleアカウント
パスワードではIMAPにログインできない。OAuth2を設定しておけば、ユーザー側の準備は不要になる。

## 1. Google Cloud Console での準備

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成 (既存でも可)
2. **APIとサービス → ライブラリ** で **Gmail API** を有効化
3. **APIとサービス → OAuth同意画面** を設定
   - User Type: 自分だけで使うなら「外部」+ テストユーザーに自分を追加
   - スコープに以下を追加:
     - `https://mail.google.com/` (IMAP/SMTPのフルアクセス。Gmailの仕様上これ以外では接続不可)
     - `https://www.googleapis.com/auth/userinfo.email` (どのメールボックスを許可したかの判定用)
4. **APIとサービス → 認証情報 → OAuthクライアントIDを作成**
   - アプリケーションの種類: **ウェブアプリケーション**
   - 承認済みのリダイレクトURI: `https://<MailDeckのドメイン>/api/oauth/google/callback`
     - ローカル開発時は `http://localhost:5000/api/oauth/google/callback`
     - **完全一致**が必要。末尾スラッシュやhttp/httpsの違いでも失敗する
5. 発行されたクライアントIDとシークレットを控える

> 同意画面が「テスト」ステータスのままだと、リフレッシュトークンが7日で失効する。
> 継続利用する場合は同意画面を「本番」に公開すること。

## 2. MailDeck側の設定

`MailDeck.Api/.env` に追加する:

```bash
OAuth__Google__ClientId=<クライアントID>
OAuth__Google__ClientSecret=<クライアントシークレット>
OAuth__Google__RedirectUri=https://<MailDeckのドメイン>/api/oauth/google/callback
```

`appsettings.json` の `OAuth:Google` セクションでも設定できるが、シークレットを
リポジトリに含めないため `.env` を推奨する。

未設定の場合、`/api/oauth/providers` が `{"google": false}` を返し、UIには
「Googleアカウントで追加」ボタンが表示されない。他の機能には影響しない。

## 3. マイグレーション適用

```bash
psql "$POSTGRES_CONNECTION_STRING" -f database/migrations/020_oauth2_accounts.sql
```

`user_server_configs` に `auth_type` と OAuth トークン用の列が追加される。
既存のパスワード認証アカウントは `auth_type = 'password'` のまま動作する。

## 4. 利用の流れ

1. 設定 → メールアカウント → 追加 → **Googleアカウントで追加**
2. Googleの同意画面でアカウントを選択して許可
3. `/api/oauth/google/callback` に戻り、IMAP/SMTP設定
   (`imap.gmail.com:993` / `smtp.gmail.com:465`) が自動登録される
4. 設定画面に戻り「連携しました」と表示される

同じメールアドレスで再度実行すると、新規追加ではなく既存アカウントのトークンが更新される。

## トークンの扱い

- **リフレッシュトークン**: KMSで暗号化して `oauth_refresh_token` に保存
- **アクセストークン**: 1時間で失効するため、`MailConnectionService` が期限5分前を切ったら
  自動でリフレッシュし、暗号化して保存 + プロセス内にキャッシュする
- **アカウント削除時**: Googleに対してトークンの失効 (revoke) をベストエフォートで実行する

## トラブルシューティング

### 「連携が切れています。再認証する」と表示される

`oauth_refresh_token` が失われた状態。リンクから再認証すれば復旧する。

### ログに `invalid_grant` が出る

ユーザーがGoogle側でアクセスを取り消した、パスワードを変更した、または同意画面が
テストステータスのまま7日経過した場合に発生する。再認証以外に復旧手段はない。

### `redirect_uri_mismatch` で同意画面がエラーになる

`OAuth__Google__RedirectUri` とGoogle Cloud Consoleの登録値が一致していない。
Cloudflare Tunnel経由の場合、リクエストのHostヘッダからは正しいURLを組み立てられないことが
あるため、環境変数での明示を推奨する。
