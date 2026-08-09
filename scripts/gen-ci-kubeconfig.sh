#!/usr/bin/env sh
# GitHub Actions (deploy.yml) 用の kubeconfig を生成する。
#
# 03-ci-rbac.yaml の ServiceAccount "maildeck-ci-deployer" のトークンを使い、
# maildeck namespace の Deployment 更新だけができる kubeconfig を作る
# (cluster-admin の /etc/rancher/k3s/k3s.yaml を CI に渡さないため)。
#
# server は Tailnet アドレスを指す。k3s の apiserver 証明書の SAN に
# そのホスト名が含まれている必要がある (未設定なら --tls-san で再生成すること)。
#
# 使い方 (クラスタに kubectl が通る端末で実行):
#   scripts/gen-ci-kubeconfig.sh                   # kubeconfig-ci.yaml を出力
#   scripts/gen-ci-kubeconfig.sh --base64          # base64 で標準出力 (GitHub Secret 用)
#   SERVER=https://k3s-05.tailef9ae7.ts.net:6443 scripts/gen-ci-kubeconfig.sh
set -eu

NAMESPACE="maildeck"
SA="maildeck-ci-deployer"
TOKEN_SECRET="maildeck-ci-deployer-token"
SERVER="${SERVER:-https://k3s-05.tailef9ae7.ts.net:6443}"
OUT="${OUT:-kubeconfig-ci.yaml}"

BASE64_OUT=0
for arg in "$@"; do
  case "$arg" in
    --base64) BASE64_OUT=1 ;;
    *) echo "不明な引数: $arg" >&2; exit 1 ;;
  esac
done

# RBAC が未適用ならここで気づけるようにする
if ! kubectl -n "$NAMESPACE" get serviceaccount "$SA" >/dev/null 2>&1; then
  echo "ServiceAccount $SA が見つかりません。先に以下を実行してください:" >&2
  echo "  kubectl apply -f infrastructure/k8s/03-ci-rbac.yaml" >&2
  exit 1
fi

# トークンと CA を Secret から取得 (03-ci-rbac.yaml が期限なしトークンを発行済み)
TOKEN=$(kubectl -n "$NAMESPACE" get secret "$TOKEN_SECRET" -o jsonpath='{.data.token}' | base64 -d)
CA=$(kubectl -n "$NAMESPACE" get secret "$TOKEN_SECRET" -o jsonpath='{.data.ca\.crt}')

if [ -z "$TOKEN" ] || [ -z "$CA" ]; then
  echo "トークン/CA を取得できませんでした (Secret $TOKEN_SECRET を確認)" >&2
  exit 1
fi

cat > "$OUT" <<EOF
apiVersion: v1
kind: Config
clusters:
  - name: k3s
    cluster:
      server: $SERVER
      certificate-authority-data: $CA
users:
  - name: $SA
    user:
      token: $TOKEN
contexts:
  - name: ci
    context:
      cluster: k3s
      user: $SA
      namespace: $NAMESPACE
current-context: ci
EOF

chmod 600 "$OUT"

if [ "$BASE64_OUT" -eq 1 ]; then
  # GitHub Secret に貼る用 (deploy.yml が base64 -d する)。改行なしで出力。
  base64 -w0 "$OUT" 2>/dev/null || base64 "$OUT" | tr -d '\n'
  echo
else
  echo "==> 生成: $OUT" >&2
  echo "疎通確認:" >&2
  echo "  KUBECONFIG=$OUT kubectl -n $NAMESPACE get deployment maildeck-api" >&2
  echo "GitHub Secret 登録:" >&2
  echo "  base64 -w0 $OUT | gh secret set KUBECONFIG --repo shuitshuit/MailDeck" >&2
fi
