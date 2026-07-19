#!/usr/bin/env sh
# UI 同梱の MailDeck.Api イメージをビルドする。
# maildeck-ui/.env の VITE_* をビルド時 --build-arg に自動展開する
# (VITE_API_URL は同一オリジン配信で相対パス /api になるため除外)。
#
# --push 時は docker buildx でマルチアーキ (linux/amd64 + linux/arm64) ビルド & push。
# push しないローカル確認ビルドはホストの native アーキ単体 (docker build) のまま。
#
# 使い方:
#   scripts/build-image.sh                       # ローカル確認用 maildeck-api:integrated
#   scripts/build-image.sh --push                # レジストリ用タグでマルチアーキ build & push
#   scripts/build-image.sh <image-tag>           # 任意タグでビルド
#   scripts/build-image.sh <image-tag> --push    # 任意タグでマルチアーキ build & push
#   ENV_FILE=maildeck-ui/.env.prod scripts/build-image.sh --push
#   PLATFORMS=linux/amd64 scripts/build-image.sh --push   # push 時のプラットフォームを絞る
set -eu

# リポジトリルートへ移動 (このスクリプトの1つ上)
cd "$(dirname "$0")/.."

# クラスタ内プライベートレジストリ (ENVIRONMENT.md: TLS なし、認証なし)
REGISTRY="k3s-05.tailef9ae7.ts.net:30500"

# push 時にビルドするプラットフォーム (amd64 + arm64 の両方を push する)
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"

BUILDER_NAME="maildeck-multiarch"

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

if [ "$PUSH" -eq 0 ]; then
  echo "==> building $IMAGE_TAG (env: $ENV_FILE, native arch only)"
  # shellcheck disable=SC2086
  docker build -f MailDeck.Api/Dockerfile $BUILD_ARGS -t "$IMAGE_TAG" .
  echo "==> built: $IMAGE_TAG"
  exit 0
fi

# ---- ここから push 時のマルチアーキ (amd64 + arm64) ビルド ----

if ! command -v docker >/dev/null 2>&1 || ! docker buildx version >/dev/null 2>&1; then
  echo "docker buildx が見つかりません。Docker Buildx プラグインを導入してください。" >&2
  exit 1
fi

# タグの先頭セグメントがホスト名っぽければ (例: k3s-05...:30500/foo, localhost/foo)
# insecure レジストリ設定の対象に加える。namespace/repo 形式 (Docker Hub) は対象外。
extract_registry_host() {
  tag="$1"
  first_segment="${tag%%/*}"
  if [ "$first_segment" != "$tag" ]; then
    case "$first_segment" in
      *.*|*:*|localhost) echo "$first_segment" ;;
    esac
  fi
}

REGISTRIES="$REGISTRY"
EXTRA_HOST="$(extract_registry_host "$IMAGE_TAG")"
if [ -n "$EXTRA_HOST" ]; then
  case " $REGISTRIES " in
    *" $EXTRA_HOST "*) ;;
    *) REGISTRIES="$REGISTRIES $EXTRA_HOST" ;;
  esac
fi

# insecure (TLSなし) レジストリ向け buildkitd 設定を生成
BUILDKITD_CONFIG="$(mktemp)"
trap 'rm -f "$BUILDKITD_CONFIG"' EXIT
: > "$BUILDKITD_CONFIG"
for host in $REGISTRIES; do
  {
    echo "[registry.\"$host\"]"
    echo "  http = true"
    echo "  insecure = true"
  } >> "$BUILDKITD_CONFIG"
done

# マルチアーキ対応の buildx ビルダーを (再) 作成する。
# insecure レジストリ設定が変わり得るため毎回作り直して常に最新設定を反映する。
docker buildx rm "$BUILDER_NAME" >/dev/null 2>&1 || true
docker buildx create --name "$BUILDER_NAME" --driver docker-container --config "$BUILDKITD_CONFIG" --use

# クロスアーキビルド用の QEMU エミュレータ登録 (ベストエフォート、失敗しても続行)
docker run --privileged --rm tonistiigi/binfmt --install all >/dev/null 2>&1 \
  || echo "警告: QEMU binfmt 登録に失敗またはスキップ (既に登録済みの可能性あり)"

docker buildx inspect --bootstrap

echo "==> building & pushing $IMAGE_TAG (env: $ENV_FILE, platforms: $PLATFORMS)"
# shellcheck disable=SC2086
docker buildx build --platform "$PLATFORMS" -f MailDeck.Api/Dockerfile $BUILD_ARGS -t "$IMAGE_TAG" --push .
echo "==> built & pushed: $IMAGE_TAG ($PLATFORMS)"
