#!/usr/bin/env sh
# UI 同梱の MailDeck.Api イメージをビルドする。
# maildeck-ui/.env の VITE_* をビルド時 --build-arg に自動展開する
# (VITE_API_URL は同一オリジン配信で相対パス /api になるため除外)。
#
# 使い方:
#   scripts/build-image.sh                       # ローカル確認用 maildeck-api:integrated
#   scripts/build-image.sh --push                # レジストリ用タグでビルド & push
#   scripts/build-image.sh <image-tag>           # 任意タグでビルド
#   scripts/build-image.sh <image-tag> --push    # 任意タグでビルド & push
#   ENV_FILE=maildeck-ui/.env.prod scripts/build-image.sh --push
set -eu

# リポジトリルートへ移動 (このスクリプトの1つ上)
cd "$(dirname "$0")/.."

# クラスタ内プライベートレジストリ (ENVIRONMENT.md: TLS なし、認証なし)
REGISTRY="k3s-05.tailef9ae7.ts.net:30500"

# 引数解析: 位置引数のタグと --push フラグ (順不同)
IMAGE_TAG=""
PUSH=0
for arg in "$@"; do
  case "$arg" in
    --push) PUSH=1 ;;
    *) IMAGE_TAG="$arg" ;;
  esac
done

# タグ未指定なら push 有無で既定を切り替え
if [ -z "$IMAGE_TAG" ]; then
  if [ "$PUSH" -eq 1 ]; then
    IMAGE_TAG="$REGISTRY/maildeck-api:latest"
  else
    IMAGE_TAG="maildeck-api:integrated"
  fi
fi

ENV_FILE="${ENV_FILE:-maildeck-ui/.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "env ファイルが見つかりません: $ENV_FILE" >&2
  exit 1
fi

# VITE_API_URL 以外の VITE_* 行を --build-arg に変換 (コメント/空行は無視)
BUILD_ARGS=""
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    \#*|"") continue ;;
    VITE_API_URL=*) continue ;;
    VITE_*=*) BUILD_ARGS="$BUILD_ARGS --build-arg $line" ;;
  esac
done < "$ENV_FILE"

echo "==> building $IMAGE_TAG (env: $ENV_FILE)"
# shellcheck disable=SC2086
docker build -f MailDeck.Api/Dockerfile $BUILD_ARGS -t "$IMAGE_TAG" .
echo "==> built: $IMAGE_TAG"

if [ "$PUSH" -eq 1 ]; then
  echo "==> pushing $IMAGE_TAG"
  docker push "$IMAGE_TAG"
  echo "==> pushed: $IMAGE_TAG"
fi
