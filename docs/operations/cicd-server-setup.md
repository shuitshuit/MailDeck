# CI/CD サーバーセットアップ手順書

GitHub Actions から OCI サーバーへ SSH + rsync でデプロイするための、
専用ユーザー作成〜GitHub Secrets 登録までの手順。

---

## 前提

- OCI サーバーに root または sudo 権限を持つユーザーでログイン済み
- OS: Ubuntu (22.04 / 24.04)
- デプロイ先パス:
  - バックエンド: `/opt/maildeck/build/`
  - フロントエンド: `/var/www/maildeck/`

---

## 1. デプロイ専用ユーザーの作成

```bash
# /bin/bash シェルで作成（SSH コマンド実行に必要）
sudo useradd --system --create-home --shell /bin/bash maildeck-deploy

# パスワードをロックしてパスワード認証でのログインを防止
sudo passwd -l maildeck-deploy
```

> `passwd -l` でパスワードをロックすることで、パスワード認証によるインタラクティブログインを防止する。
> SSH 鍵認証 + コマンド実行は引き続き動作する。
> `nologin` はコマンド実行も拒否するため SSH デプロイには使えない。

---

## 2. SSH 鍵ペアの生成

**ローカル PC（Windows）で実行する。**

```powershell
ssh-keygen -t ed25519 -C "github-actions-maildeck" -f "$HOME\.ssh\github-actions-maildeck" -N ""
```

生成されるファイル:

| ファイル | 用途 |
|---|---|
| `~\.ssh\github-actions-maildeck` | 秘密鍵 → GitHub Secrets に登録 |
| `~\.ssh\github-actions-maildeck.pub` | 公開鍵 → サーバーに登録 |

---

## 3. 公開鍵をサーバーの maildeck-deploy ユーザーに登録

```bash
# maildeck-deploy ユーザーの .ssh ディレクトリを作成
sudo mkdir -p /home/maildeck-deploy/.ssh
sudo chmod 700 /home/maildeck-deploy/.ssh

# 公開鍵を貼り付ける（ローカルで cat github-actions-maildeck.pub した内容をコピー）
sudo tee /home/maildeck-deploy/.ssh/authorized_keys <<'EOF'
ssh-ed25519 AAAA...（公開鍵の内容をここに貼り付ける）... github-actions-maildeck
EOF

sudo chmod 600 /home/maildeck-deploy/.ssh/authorized_keys
sudo chown -R maildeck-deploy:maildeck-deploy /home/maildeck-deploy/.ssh
```

---

## 4. デプロイ先ディレクトリの所有権を maildeck-deploy に付与

```bash
# バックエンドビルドディレクトリ
sudo mkdir -p /opt/maildeck/build
sudo chown -R maildeck-deploy:maildeck-deploy /opt/maildeck/build

# フロントエンド静的ファイルディレクトリ
sudo mkdir -p /var/www/maildeck
sudo chown -R maildeck-deploy:maildeck-deploy /var/www/maildeck
```

> rsync の書き込みはファイルシステム権限で制御するため、sudo は不要になる。
> nginx のデフォルトサイトと競合しないよう、配信先は `/var/www/html` ではなく MailDeck 専用の `/var/www/maildeck` を使用する。nginx の `root` も同じパスに設定すること（[infrastructure/nginx/maildeck.conf](../../infrastructure/nginx/maildeck.conf)）。

---

## 5. sudoers の設定（最小権限）

maildeck-deploy が実行できる `sudo` コマンドを厳密に列挙する。

```bash
sudo tee /etc/sudoers.d/maildeck-deploy <<'EOF'
# maildeck-deploy: CI/CD デプロイ専用ユーザー
# maildeck-api の再起動と状態確認、ログ確認のみ許可
Defaults:maildeck-deploy !requiretty
maildeck-deploy ALL=(ALL) NOPASSWD: /bin/systemctl restart maildeck-api.service
maildeck-deploy ALL=(ALL) NOPASSWD: /bin/systemctl is-active maildeck-api.service
maildeck-deploy ALL=(ALL) NOPASSWD: /usr/bin/journalctl -u maildeck-api -n 30 --no-pager
EOF

# 構文チェック（必ず実行する）
sudo visudo -c -f /etc/sudoers.d/maildeck-deploy
```

> `visudo -c` でエラーが出た場合はファイルを修正してから続行すること。
> sudoers の構文エラーは sudo 全体を壊すリスクがある。

---

## 6. SSH 接続テスト

ローカル PC から maildeck-deploy での接続を確認する。

```powershell
# 接続テスト（コマンドを実行できるか確認）
ssh -i "$HOME\.ssh\github-actions-maildeck" -o StrictHostKeyChecking=no maildeck-deploy@<SERVER_IP> "echo OK"

# sudo の権限確認
ssh -i "$HOME\.ssh\github-actions-maildeck" maildeck-deploy@<SERVER_IP> "sudo systemctl is-active maildeck-api.service"

# 書き込み権限確認
ssh -i "$HOME\.ssh\github-actions-maildeck" maildeck-deploy@<SERVER_IP> "touch /opt/maildeck/build/.test && rm /opt/maildeck/build/.test && echo 'write OK'"
ssh -i "$HOME\.ssh\github-actions-maildeck" maildeck-deploy@<SERVER_IP> "touch /var/www/maildeck/.test && rm /var/www/maildeck/.test && echo 'write OK'"
```

すべて OK が返れば設定完了。

---

## 7. GitHub Secrets の登録

リポジトリの **Settings → Secrets and variables → Actions → New repository secret** から登録する。

| Secret 名 | 値 |
|---|---|
| `SSH_PRIVATE_KEY` | `github-actions-maildeck`（秘密鍵ファイル）の中身をそのままコピー |
| `SERVER_HOST` | OCI サーバーのパブリック IP またはドメイン名 |
| `SERVER_USER` | `maildeck-deploy` |
| `VITE_API_URL` | `https://maildeck.shuit.net` |
| `VITE_AWS_REGION` | Cognito のリージョン (例: `us-west-2`) |
| `VITE_USER_POOL_ID` | Cognito User Pool ID |
| `VITE_USER_POOL_CLIENT_ID` | Cognito App Client ID |
| `VITE_COGNITO_DOMAIN` | Cognito ホストされた UI のドメイン |
| `VITE_REDIRECT_URI` | サインイン後のリダイレクト先 URL |
| `VITE_SIGNOUT_URI` | サインアウト後のリダイレクト先 URL |

**秘密鍵の中身をコピーする方法 (PowerShell):**

```powershell
Get-Content "$HOME\.ssh\github-actions-maildeck" | Set-Clipboard
```

`-----BEGIN OPENSSH PRIVATE KEY-----` から `-----END OPENSSH PRIVATE KEY-----` まで
改行を含めてそのまま登録する。

---

## 8. ヘルスチェックエンドポイントの確認

[deploy.yml](../.github/workflows/deploy.yml) のヘルスチェックは `http://localhost:5000/health` を使用している。
ASP.NET Core の Health Checks が有効になっているか確認する。

```bash
# サーバー上で確認
curl -s http://localhost:5000/health
```

`Healthy` が返れば OK。返らない場合は `Program.cs` に以下を追加する:

```csharp
// Program.cs
builder.Services.AddHealthChecks();
// ...
app.MapHealthChecks("/health");
```

---

## 9. 動作確認

main ブランチに何かコミットを push して GitHub Actions の実行を確認する。

1. GitHub リポジトリの **Actions** タブを開く
2. **CI** ワークフローが green になることを確認
3. 続いて **Deploy** ワークフローが起動し green になることを確認
4. サーバーで `sudo systemctl status maildeck-api` が active になっていることを確認

---

## ユーザーの権限まとめ

| 操作 | 可否 | 方法 |
|---|---|---|
| SSH でのインタラクティブログイン | **不可** | shell = nologin |
| SSH 鍵認証でのコマンド実行 | 可 | authorized_keys |
| `/opt/maildeck/build/` への書き込み | 可 | ファイルシステム所有権 |
| `/var/www/maildeck/` への書き込み | 可 | ファイルシステム所有権 |
| `maildeck-api` の再起動 | 可 | sudoers (コマンド指定) |
| `maildeck-api` の状態確認 | 可 | sudoers (コマンド指定) |
| `maildeck-api` のログ確認 | 可 | sudoers (コマンド指定) |
| その他の systemctl 操作 | **不可** | sudoers 未記載 |
| root へのエスカレーション | **不可** | sudoers 未記載 |
| その他のファイルへのアクセス | **不可** | 所有権なし |
