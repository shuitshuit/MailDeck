# UUID移行ガイド

## 概要

このドキュメントは、MailDeckのメールアカウントID、連絡先ID、Web Pushサブスクリプションアカウント IDをSERIAL型からUUID型に移行するための手順を説明します。

## 変更内容

### データベーススキーマ

以下のテーブルのIDカラムをSERIALからUUIDに変更しました:

1. **user_server_configs**
   - `id`: `SERIAL` → `UUID`

2. **contacts**
   - `id`: `SERIAL` → `UUID`

3. **web_push_subscriptions**
   - `id`: `SERIAL` → `UUID`

### バックエンド (C# / ASP.NET Core)

#### モデル変更

- `MailDeck.Api/Models/UserServerConfig.cs`
  - `Id` プロパティ: `int` → `Guid`
  - `[Serial]` 属性を削除

- `MailDeck.Api/Models/Contact.cs`
  - `Id` プロパティ: `int` → `Guid`
  - `[Serial]` 属性を削除

- `MailDeck.Api/Models/WebPushSubscription.cs`
  - `Id` プロパティ: `int` → `Guid`
  - `[Serial]` 属性を削除

#### コントローラー変更

- `MailDeck.Api/Controllers/ServerConfigController.cs`
  - `AddConfig`: `config.Id = Guid.NewGuid()` でUUID生成
  - `UpdateConfig(Guid id, ...)`: パラメータ型を `int` → `Guid`
  - `DeleteConfig(Guid id)`: パラメータ型を `int` → `Guid`

- `MailDeck.Api/Controllers/ContactsController.cs`
  - `AddContact`: `contact.Id = Guid.NewGuid()` でUUID生成
  - `UpdateContact(Guid id, ...)`: パラメータ型を `int` → `Guid`
  - `DeleteContact(Guid id)`: パラメータ型を `int` → `Guid`

- `MailDeck.Api/Controllers/WebPushController.cs`
  - `Subscribe`: `subscription.Id = Guid.NewGuid()` でUUID生成

### フロントエンド (TypeScript / React)

#### 型定義変更

すべての `id: number` を `id: string` に変更:

- `maildeck-ui/src/pages/ContactsPage.tsx`
- `maildeck-ui/src/components/ComposeModal.tsx`
- `maildeck-ui/src/pages/DashboardPage.tsx`
- `maildeck-ui/src/pages/SettingsPage.tsx`

#### API関数変更

`maildeck-ui/src/lib/api.ts`:
- `getInbox(configId: string, ...)`: パラメータ型を `number` → `string`
- `getMessage(configId: string, ...)`: パラメータ型を `number` → `string`
- `updateServerConfig(id: string, ...)`: パラメータ型を `number` → `string`
- `deleteServerConfig(id: string)`: パラメータ型を `number` → `string`
- `updateContact(id: string, ...)`: パラメータ型を `number` → `string`

#### UI変更

- `DashboardPage.tsx`: タブ切り替えで `activeTab` を `0` (数値) から `'all'` (文字列) に変更

## 移行手順

### 既存データベースの場合

1. **バックアップを取得**
   ```bash
   pg_dump -U postgres -d maildeck > maildeck_backup_$(date +%Y%m%d).sql
   ```

2. **マイグレーションスクリプトを実行**
   ```bash
   psql -U postgres -d maildeck -f database/MigrateToUUID.sql
   ```

   このスクリプトは以下を実行します:
   - UUID拡張機能を有効化
   - 既存のレコードに新しいUUIDを生成
   - 古いSERIAL IDを削除
   - 新しいUUIDをプライマリキーとして設定

3. **アプリケーションを再起動**
   ```bash
   sudo systemctl restart maildeck-api
   sudo systemctl restart maildeck-ui
   ```

### 新規データベースの場合

1. **更新されたスキーマを使用**
   ```bash
   psql -U postgres -d maildeck -f database/CreateTables.sql
   ```

   新しいスキーマは自動的にUUID型を使用します。

## セキュリティ上の利点

UUID使用により以下のセキュリティ向上が実現されます:

1. **推測攻撃の防止**: 連続したIDではなくランダムなUUIDのため、他のユーザーのリソースへのアクセスを推測することが困難
2. **情報漏洩の防止**: ID自体からシステムの規模やレコード数を推測できない
3. **列挙攻撃の防止**: 順次IDをスキャンする攻撃が実質的に不可能

## 注意事項

### パフォーマンス

- UUIDはSERIAL (INTEGER)より16バイト大きい (128ビット vs 32ビット)
- インデックスサイズが若干増加しますが、小〜中規模のアプリケーションでは影響は無視できる程度
- PostgreSQLのUUID型は効率的に最適化されています

### 互換性

- 既存のクライアントアプリケーションは新しいバージョンに更新する必要があります
- 古いAPIバージョンとの後方互換性はありません

## トラブルシューティング

### マイグレーション失敗時

1. バックアップからリストア:
   ```bash
   psql -U postgres -d maildeck < maildeck_backup_YYYYMMDD.sql
   ```

2. ログを確認:
   ```bash
   tail -f logs/maildeck-$(date +%Y%m%d).json
   ```

### 型エラーが発生する場合

- フロントエンドとバックエンドの両方が更新されていることを確認
- ブラウザのキャッシュをクリア
- `npm run build` でフロントエンドを再ビルド

## 検証

移行後、以下を確認してください:

1. **データベース**
   ```sql
   SELECT id FROM user_server_configs LIMIT 5;
   SELECT id FROM contacts LIMIT 5;
   ```
   UUID形式 (例: `550e8400-e29b-41d4-a716-446655440000`) が表示されることを確認

2. **API**
   - `/api/serverconfig` で正しいUUID形式のIDが返されることを確認
   - `/api/contacts` で正しいUUID形式のIDが返されることを確認

3. **UI**
   - アカウント追加/編集/削除が正常に動作することを確認
   - 連絡先追加/編集/削除が正常に動作することを確認
   - メール送信時のアカウント選択が正常に動作することを確認
