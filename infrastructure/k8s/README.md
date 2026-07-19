# k3s デプロイメント

MailDeck を自宅 k3s クラスタにデプロイするためのマニフェスト一式です。
このクラスタ固有の流儀 (Traefik NodePort / 1Password Operator / プライベートレジストリ /
cert-manager DNS-01) は `k3s-manifests` リポジトリの `ENVIRONMENT.md` に準拠しています。

**UI は API の `wwwroot` から同一オリジンで配信**します (単一 Pod / 単一イメージ)。
UI 用の別 Deployment・別イメージ・nginx は不要です。

## 構成

| ファイル | 内容 |
|---------|------|
| `00-namespace.yaml` | `maildeck` namespace |
| `01-api-config.yaml` | バックエンドの非機密設定 (ConfigMap) |
| `02-onepassword-item.yaml` | 機密値を 1Password から取り込む `OnePasswordItem` |
| `10-api-deployment.yaml` | MailDeck.Api (UI 同梱) の Deployment + Service |
| `30-ingress.yaml` | Traefik Ingress (全パス → API、TLS 終端) |

## 前提: クラスタ側の設定

### 1. プライベートレジストリの insecure 登録 (全ノード)

イメージは TLS なしのクラスタ内レジストリ `k3s-05.tailef9ae7.ts.net:30500` から pull します。
**全ノード**で `/etc/rancher/k3s/registries.yaml` を設定し `k3s`/`k3s-agent` を再起動しておくこと
(未設定だと containerd の pull が失敗する。詳細は `ENVIRONMENT.md`)。

```yaml
# /etc/rancher/k3s/registries.yaml
mirrors:
  "k3s-05.tailef9ae7.ts.net:30500":
    endpoint:
      - "http://k3s-05.tailef9ae7.ts.net:30500"
configs:
  "k3s-05.tailef9ae7.ts.net:30500":
    tls:
      insecure_skip_verify: true
```

### 2. 1Password 側の item 作成

`02-onepassword-item.yaml` は 1Password vault `k3s` の item `maildeck-api-secret` を
参照します。事前に 1Password 上で同名 item を作り、以下フィールドを埋めておくこと。
**フィールドのラベル名がそのまま Secret のキー = 環境変数名**になります
(ASP.NET の設定キーは `__` が階層区切り。例: `AWS:KmsKeyId` → `AWS__KmsKeyId`):

`DefaultConnection` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` /
`AWS__KmsKeyId` / `WebPush__PublicKey` / `LAMBDA_API_KEY`

> **注意**: KMS キー ARN のフィールド名は `KMS_KEY_ID` ではなく `AWS__KmsKeyId`
> (コードは `AWS:KmsKeyId` を読む)。Web Push 公開鍵も `VAPID_PUBLIC_KEY` ではなく
> `WebPush__PublicKey` (コードは `WebPush:PublicKey` を読む)。
> プッシュ送信は Firebase(FCM) 移行済みのため VAPID 秘密鍵 / Subject は不要です。
> `LAMBDA_API_KEY` のみ env 直読み (アンダースコア変換なし) でそのままの名前です。

Operator が同名の `Secret` を maildeck namespace に自動生成し、API Deployment の
`envFrom.secretRef` がそれを読みます。

## イメージのビルドと push

UI は API のイメージに同梱されるため **ビルドは 1 つだけ**です
(`MailDeck.Api/Dockerfile` がマルチステージで UI をビルドし wwwroot に配置する)。
push 時は `linux/amd64` + `linux/arm64` の**マルチアーキイメージ**を `docker buildx` で
ビルド & push します (クラスタのノードが amd64/arm64 混在でも同じタグで pull できる)。
push 側の開発機に以下が必要です:

- `docker buildx` プラグイン (Docker Desktop / 最近の Docker Engine には同梱)
- クロスアーキビルド用の QEMU (未登録ならスクリプトが `tonistiigi/binfmt` で自動登録を試みる。
  `--privileged` でコンテナを起動するため失敗する環境では事前に手動登録しておくこと)

insecure registry (`k3s-05.tailef9ae7.ts.net:30500`, TLS なし) 向けの設定は、
スクリプトが実行の都度 buildx 用の `buildkitd.toml` を生成してビルダーに渡すため
`/etc/docker/daemon.json` の `insecure-registries` 登録は **push 側に不要**です
(ローカル確認ビルド `docker build` のみを使う場合は従来通り不要)。

VITE_ 変数はビルド時に UI に埋め込まれます (VITE_API_URL は同一オリジンの相対パス /api に
なるため不要)。値は `maildeck-ui/.env` に用意し、ヘルパースクリプトが --build-arg に
自動展開します (VITE_API_URL は自動で除外)。

```bash
# リポジトリルートで実行。デフォルトタグ maildeck-api:integrated (ローカル確認用、push なし、native arch のみ)
scripts/build-image.sh
# クラスタ内レジストリ用タグで amd64+arm64 マルチアーキ build & push (タグ省略時は既定レジストリを自動採用)
scripts/build-image.sh --push
# 任意タグを指定 (--push と併用可)
scripts/build-image.sh k3s-05.tailef9ae7.ts.net:30500/maildeck-api:latest --push
# 別の env ファイルを使う場合
ENV_FILE=maildeck-ui/.env.prod scripts/build-image.sh --push
# push するプラットフォームを絞る場合
PLATFORMS=linux/amd64 scripts/build-image.sh --push
```

Windows (PowerShell) では同じ引数体系で `build-image.ps1` を使います:

```powershell
./scripts/build-image.ps1              # ローカル確認用 (push なし、native arch のみ)
./scripts/build-image.ps1 -Push        # 既定レジストリタグで amd64+arm64 マルチアーキ build & push
./scripts/build-image.ps1 -ImageTag <tag> -Push
./scripts/build-image.ps1 -Push -Platforms linux/amd64
```

<details><summary>スクリプトを使わず直接 docker build する場合</summary>

```bash
docker build -f MailDeck.Api/Dockerfile \
  --build-arg VITE_AWS_REGION=us-west-2 \
  --build-arg VITE_USER_POOL_ID=us-west-2_XXXXXXXXX \
  --build-arg VITE_USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx \
  --build-arg VITE_COGNITO_DOMAIN=<cognito-domain> \
  --build-arg VITE_REDIRECT_URI=https://maildeck.shuit.net/ \
  --build-arg VITE_SIGNOUT_URI=https://maildeck.shuit.net/ \
  -t k3s-05.tailef9ae7.ts.net:30500/maildeck-api:latest .
```
</details>

## デプロイ

```bash
kubectl apply -f 00-namespace.yaml
kubectl apply -f 01-api-config.yaml
kubectl apply -f 02-onepassword-item.yaml
kubectl apply -f 10-api-deployment.yaml
kubectl apply -f 30-ingress.yaml

# 状態確認
kubectl -n maildeck get pods,svc,ingress
# Secret が 1Password から生成されたか確認
kubectl -n maildeck get secret maildeck-api-secret
# 証明書の発行状況
kubectl -n maildeck get certificate
```

## 注意点

- **外部公開は NodePort + Traefik**: このクラスタは `--disable=servicelb` のため
  `type: LoadBalancer` は使えません。公開は Traefik Ingress (websecure=30443) 経由のみ。
  標準 443 での到達は公開ノードの socat 転送に依存 (`ENVIRONMENT.md` 参照)。
- **TLS**: `letsencrypt-dns` ClusterIssuer (Cloudflare DNS-01) で `maildeck-tls` を発行。
  Ingress の annotation から cert-manager の ingress-shim が Certificate を自動生成します。
  発行されない場合は Cloudflare API トークンの IP 制限 (error 9109/10502) を疑うこと。
- **VITE_ 変数はビルド時に埋め込まれる**: フロントの環境設定を変えたら再ビルドが必要です
  (過去に環境変数がビルドに反映されない問題があったため要注意)。
- **ヘルスチェック**: API は `/healthz` 未実装のため TCP プローブを使用しています。
  `Program.cs` に `app.MapGet("/healthz", () => "ok");` を追加すれば
  `10-api-deployment.yaml` のプローブを `httpGet` に変更できます。
- **AWS 認証**: 自宅 k3s のため IRSA は使えず、IAM ユーザーのアクセスキーが必要です
  (1Password の `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`)。
- **Firebase キー**: `maildeck-e3e14-c48c7854b564.json` はイメージに含まれます。
  秘匿性が高い場合は 1Password + volumeMount に切り出してください。
- **PostgreSQL**: このマニフェストには含めていません。既存の外部 DB に接続する想定です
  (`pgbouncer` namespace の PgBouncer 経由も検討可)。
