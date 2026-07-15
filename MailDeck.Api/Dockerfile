# syntax=docker/dockerfile:1

# ---- UI build stage ----
# React SPA をビルドし、後段で API の wwwroot へ配置する。
# VITE_ 変数はビルド時に埋め込まれるため build-arg で渡す。
# (VITE_API_URL は同一オリジン配信で相対パス /api になるため不要)
FROM node:22-alpine AS ui-build
WORKDIR /ui

COPY maildeck-ui/package*.json ./
RUN npm ci

COPY maildeck-ui/ ./

# build-arg で受け取った VITE_ 値を ENV に昇格させ、Vite のビルドに渡す。
# (ARG だけだと npm run build の環境には入らない)
ARG VITE_AWS_REGION
ARG VITE_USER_POOL_ID
ARG VITE_USER_POOL_CLIENT_ID
ARG VITE_COGNITO_DOMAIN
ARG VITE_REDIRECT_URI
ARG VITE_SIGNOUT_URI
ENV VITE_AWS_REGION=$VITE_AWS_REGION \
    VITE_USER_POOL_ID=$VITE_USER_POOL_ID \
    VITE_USER_POOL_CLIENT_ID=$VITE_USER_POOL_CLIENT_ID \
    VITE_COGNITO_DOMAIN=$VITE_COGNITO_DOMAIN \
    VITE_REDIRECT_URI=$VITE_REDIRECT_URI \
    VITE_SIGNOUT_URI=$VITE_SIGNOUT_URI
# VITE_API_URL は渡さない → コード側フォールバック '/api' (同一オリジン) になる
RUN npm run build

# ---- .NET build stage ----
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# 依存関係の復元 (レイヤーキャッシュ最適化)
COPY MailDeck.Api/MailDeck.Api.csproj MailDeck.Api/
RUN dotnet restore MailDeck.Api/MailDeck.Api.csproj

# ソースをコピーして publish
COPY MailDeck.Api/ MailDeck.Api/
RUN dotnet publish MailDeck.Api/MailDeck.Api.csproj \
    -c Release \
    -o /app/publish \
    --no-restore \
    /p:PublishDir=/app/publish

# ---- Runtime stage ----
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

# 非rootユーザーで実行
RUN adduser --disabled-password --gecos "" --uid 1001 appuser
USER appuser

COPY --from=build --chown=appuser:appuser /app/publish ./
# UI のビルド成果物を wwwroot へ配置 (UseStaticFiles で配信)
COPY --from=ui-build --chown=appuser:appuser /ui/dist ./wwwroot

# .NET 8 のコンテナデフォルトは 8080
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "MailDeck.Api.dll"]
