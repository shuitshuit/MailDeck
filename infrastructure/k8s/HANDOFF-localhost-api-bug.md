# 引き継ぎ: 本番フロントが `http://localhost:5000/api` を叩く問題

## 症状

本番 `https://maildeck.shuit.net` を開くと、フロントの全 API リクエストが
`http://localhost:5000/api/serverconfig` 等（= localhost:5000）宛てになり、すべて失敗する。
ブラウザ DevTools のリクエスト URL が `http://localhost:5000/api/...` になっている。

## 根本原因（調査済み）

Vite の `VITE_API_URL` が **ビルド時に JS バンドルへ静的に焼き込まれる**のが原因。
コード自体にハードコードは無く、フォールバックは正しく `/api`（相対・同一オリジン）:

- `maildeck-ui/src/lib/api.ts:19` → `const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';`
- `maildeck-ui/src/lib/webpush.ts:3` → 同じく `|| '/api'`

焼き込まれた値の出どころは `maildeck-ui/.env`:

```
VITE_API_URL=http://localhost:5000/api   # ローカル開発用の値
```

### なぜ焼き込まれたか（2つの独立したバグが連動）

1. **`.env` がビルドコンテナに混入していた（主因）**
   `MailDeck.Api/Dockerfile` の `COPY maildeck-ui/ ./` が `maildeck-ui/.env` ごとコピーし、
   その後の `npm run build` がこの `.env` を読んでいた。
   → `build-image` スクリプトが `--build-arg VITE_API_URL` を渡さない設計でも**無意味**だった
     （コンテナ内の `.env` ファイルが直接読まれるため）。

2. **Dockerfile が `ARG` を `ENV` に昇格していなかった**
   `ARG VITE_*` を宣言するだけで `ENV` にしていなかったため、`--build-arg` で渡した
   Cognito 等の本番値が Vite ビルドに届いていなかった。`.env` を消すとこのバグが顕在化し、
   Cognito 設定や redirect URI が空になる（例: `VITE_REDIRECT_URI` 未反映で
   `http://localhost:5173/` にフォールバックしログイン後リダイレクトが壊れる）。

## この作業ブランチで修正済みの内容（要コミット & push）

以下2ファイルを修正済み。**まだ git 未コミット（`git status` で `??` / `M`）**。
k3s 側で `git pull` して使うなら、先にコミット & push が必要。

### 1. `.dockerignore`（`.env` をビルドコンテキストから除外）
```
maildeck-ui/.env
maildeck-ui/.env.*
!maildeck-ui/.env.example
```

### 2. `MailDeck.Api/Dockerfile`（`ARG` → `ENV` 昇格）
UI build stage で、build-arg で受けた VITE_ 値を ENV に昇格させ Vite に渡すよう修正。
`VITE_API_URL` は意図的に渡さない → コード側フォールバック `/api`（同一オリジン）になる。

## 検証結果（修正後イメージ）

修正後にビルドしたイメージ（`sha256:568b98...`）を確認:
```bash
docker run --rm --entrypoint sh <image> -c "grep -o 'localhost[:0-9/a-zA-Z]*' /app/wwwroot/assets/index-*.js | sort -u"
# → localhost:5000/api は消えた ✅
# → localhost:5173/ だけ残る（VITE_REDIRECT_URI が未反映のため。下記「残タスク」参照）
```

**ただし本番ブラウザにはまだ古いイメージ（localhost:5000 入り）が配信されている。**
修正後イメージをレジストリ tag でビルド → push → k3s で rollout restart する必要がある。

## 残タスク（k3s エージェントで実施）

### A. 修正2ファイルを commit & push（git pull で引き継ぐ場合）
- 対象: `.dockerignore`, `MailDeck.Api/Dockerfile`
- （新規ファイル群 `infrastructure/k8s/`, `scripts/` も未コミットなら合わせて）

### B. redirect URI 問題の解消（`localhost:5173` を消す）
`VITE_REDIRECT_URI` / `VITE_SIGNOUT_URI` が本番 URL でビルドされる必要がある。
`.env` はローカル開発用（localhost:5173）なので、**本番用 env を分けるのが正解**。

`scripts/build-image.sh` は `ENV_FILE` 環境変数で env ファイルを切替可能（既定 `maildeck-ui/.env`）。
本番用 `maildeck-ui/.env.prod` を作成:
```
VITE_AWS_REGION=us-west-2
VITE_USER_POOL_ID=us-west-2_XXXXXXXXX          # 実値に置換
VITE_USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxx # 実値に置換
VITE_COGNITO_DOMAIN=<cognito-domain>            # 実値に置換
VITE_REDIRECT_URI=https://maildeck.shuit.net/
VITE_SIGNOUT_URI=https://maildeck.shuit.net/
# VITE_API_URL は書かない（同一オリジン /api にフォールバックさせる）
```
※ `.env.prod` は `.dockerignore` の `maildeck-ui/.env.*` で除外されるので、値は build-arg 経由で入る。
※ 実値は既存の `maildeck-ui/.env` の VITE_USER_POOL_ID / VITE_USER_POOL_CLIENT_ID /
   VITE_COGNITO_DOMAIN からコピーすること（このマシンでは .env が権限で読めなかった）。

### C. ビルド & push & デプロイ
```bash
# 本番 env でビルド & push
ENV_FILE=maildeck-ui/.env.prod scripts/build-image.sh --push
# （タグ省略時は既定 k3s-05.tailef9ae7.ts.net:30500/maildeck-api:latest）

# k3s に反映（imagePullPolicy: IfNotPresent かつ :latest 固定なので rollout restart が必要）
kubectl -n maildeck rollout restart deploy/maildeck-api
kubectl -n maildeck rollout status  deploy/maildeck-api
```

### D. 検証
1. push したイメージ、または稼働 Pod の wwwroot に localhost が無いことを確認:
   ```bash
   docker run --rm --entrypoint sh <pushed-image> -c \
     "grep -ro 'localhost[:0-9/a-zA-Z]*' /app/wwwroot/assets/ | sort -u || echo 'OK: localhost なし'"
   ```
   → `localhost:5000` も `localhost:5173` も出ないのが合格。
2. ブラウザで `https://maildeck.shuit.net` を開き、DevTools Network で
   リクエスト URL が `https://maildeck.shuit.net/api/...`（同一オリジン相対）になっていること。
3. ログイン → Cognito リダイレクトが `https://maildeck.shuit.net/` に戻ること。

## 注意点・ハマりどころ

- **`:latest` タグ + `IfNotPresent`**: 同一タグで push しても Pod は古いイメージを使い続ける。
  必ず `rollout restart` すること（`10-api-deployment.yaml:31`）。確実を期すなら日付タグ推奨。
- **UI と API は同一イメージ・同一オリジン**: UI は API の `wwwroot` から配信される
  （`Dockerfile` 末尾で `/ui/dist` → `./wwwroot`）。だから `VITE_API_URL` は不要で `/api` が正しい。
- **`npm run build` を直接使わない**: 素の `npm run build` は開発用 `.env`(localhost) を読む。
  必ず `build-image` スクリプト経由（= Docker ビルド、`.dockerignore` で `.env` 除外済み）。
- **Cloudflare Pages にも同じ UI を出しているなら**: そちらは Pages の環境変数で
  `VITE_API_URL` を設定するか未設定にする必要がある（このイメージの修正は k3s 配信分のみ）。

## 参照ファイル

- `MailDeck.Api/Dockerfile` — UI ビルド stage（ARG→ENV 修正済み）
- `.dockerignore` — `.env` 除外（修正済み）
- `scripts/build-image.sh` / `scripts/build-image.ps1` — ビルドヘルパー（ENV_FILE 対応）
- `maildeck-ui/src/lib/api.ts:19` / `webpush.ts:3` — API_BASE_URL フォールバック `/api`
- `infrastructure/k8s/10-api-deployment.yaml` — Deployment（:latest / IfNotPresent）
- `infrastructure/k8s/README.md` — デプロイ手順全般
