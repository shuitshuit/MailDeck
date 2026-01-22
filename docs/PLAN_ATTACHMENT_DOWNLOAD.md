# 添付ファイルダウンロード機能 実装計画書

**作成日**: 2026-01-22
**対象ブランチ**: `claude/plan-file-download-7l8zd`
**関連Issue**: 添付ファイルダウンロード機能の追加

---

## 1. 機能概要

### 1.1 目的
MailDeckで受信したメールの添付ファイルを閲覧・ダウンロードできる機能を実装する。

### 1.2 ユーザーストーリー
- **As a** MailDeckユーザー
- **I want to** 受信メールの添付ファイルを確認・ダウンロードしたい
- **So that** メール本文だけでなくファイルも取得できる

### 1.3 スコープ

**Phase 1（本実装）: ダウンロード機能**
- ✅ 添付ファイル一覧の表示
- ✅ 個別ファイルのダウンロード
- ✅ ファイル情報（名前、サイズ、MIMEタイプ）の表示
- ✅ セキュリティ対策（ファイルタイプ検証、サイズ制限）

**Phase 2（将来実装）: 送信機能**
- ⏳ メール作成時のファイル添付
- ⏳ SMTP経由での添付ファイル送信

**Phase 3（将来実装）: 高度な機能**
- ⏳ 添付ファイルのプレビュー（画像、PDF）
- ⏳ ウイルススキャン統合
- ⏳ 添付ファイル検索フィルター

---

## 2. 現状分析

### 2.1 実装状況（2026-01-22時点）

| 項目 | バックエンド | フロントエンド | 状態 |
|------|-------------|---------------|------|
| メール詳細取得 | ✅ `/api/mail/message/{id}` | ✅ `MailDetailModal.tsx` | 動作中 |
| 添付ファイル表示 | ❌ データなし | ❌ UIなし | 未実装 |
| 添付ファイルDL | ❌ エンドポイントなし | ❌ ハンドラーなし | 未実装 |

### 2.2 既存コードの課題

**バックエンド (`MailController.cs`)**
```csharp
// 現在: MimeMessageを取得するが本文のみ抽出
var message = inbox.GetMessage(uid);
var bodyHtml = message.HtmlBody;
var bodyText = message.TextBody;
// ❌ message.Attachments を処理していない
```

**フロントエンド (`MailDetailModal.tsx`)**
```typescript
// 現在: メッセージ型に添付ファイルフィールドがない
interface MessageDetail {
    id: string;
    subject: string;
    // ...
    bodyHtml: string;
    bodyText: string;
    // ❌ attachments フィールドなし
}
```

### 2.3 技術スタック（既存）
- **MailKit**: IMAP/SMTP操作、MIMEパース
- **MailDeck.Api**: .NET 10.0 Web API
- **React 19**: フロントエンドUI
- **PostgreSQL**: メタデータ保存（添付ファイル自体は保存しない）

---

## 3. 技術設計

### 3.1 アーキテクチャ概要

```
┌─────────────────────┐
│  MailDetailModal    │  添付ファイル一覧表示
│  (React Component)  │  ダウンロードボタン
└──────────┬──────────┘
           │ GET /api/mail/message/{id}
           │ ↓ response: { attachments: [...] }
           │
┌──────────▼──────────┐
│  MailController.cs  │  MailKitで添付ファイル抽出
│  (.NET API)         │  MimePartをBase64エンコード
└──────────┬──────────┘
           │ IMAP SSL/TLS
           │
┌──────────▼──────────┐
│  IMAPサーバー       │  Gmail, Outlook, etc.
│  (外部)             │
└─────────────────────┘
```

---

### 3.2 バックエンド設計

#### 3.2.1 新規モデル: `AttachmentDto.cs`

**ファイルパス**: `MailDeck.Api/Models/DTO/AttachmentDto.cs`

```csharp
namespace MailDeck.Api.Models.DTO;

/// <summary>
/// メール添付ファイルのDTO
/// </summary>
public class AttachmentDto
{
    /// <summary>
    /// 添付ファイル名（例: "document.pdf"）
    /// </summary>
    public required string FileName { get; set; }

    /// <summary>
    /// MIMEタイプ（例: "application/pdf", "image/png"）
    /// </summary>
    public required string ContentType { get; set; }

    /// <summary>
    /// ファイルサイズ（バイト）
    /// </summary>
    public long Size { get; set; }

    /// <summary>
    /// Base64エンコードされたファイル内容
    /// </summary>
    public required string ContentBase64 { get; set; }

    /// <summary>
    /// Content-ID（インライン画像の場合）
    /// </summary>
    public string? ContentId { get; set; }

    /// <summary>
    /// インライン添付かどうか
    /// </summary>
    public bool IsInline { get; set; }
}
```

#### 3.2.2 既存モデル拡張: `MailMessageDetailResponse.cs`

**変更内容**:
```csharp
public class MailMessageDetailResponse
{
    // ... 既存フィールド（subject, from, to, etc.）

    /// <summary>
    /// 添付ファイル一覧（新規追加）
    /// </summary>
    public List<AttachmentDto> Attachments { get; set; } = new();
}
```

#### 3.2.3 コントローラー変更: `MailController.cs`

**変更箇所**: `GetMessage` メソッド（Line 354-412）

**実装ロジック**:
```csharp
[HttpGet("message/{id}")]
public async Task<IActionResult> GetMessage(string id, [FromQuery] Guid configId)
{
    var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
    if (string.IsNullOrEmpty(userId))
        return Unauthorized();

    // ... 既存の認証・IMAP接続コード ...

    var uid = uint.Parse(id);
    var message = inbox.GetMessage(uid);

    // ✅ 新規: 添付ファイル処理
    var attachments = new List<AttachmentDto>();
    foreach (var attachment in message.Attachments)
    {
        // セキュリティチェック
        if (attachment is MimePart mimePart &&
            mimePart.ContentObject?.Stream != null)
        {
            // サイズ制限（50MB）
            if (mimePart.ContentObject.Stream.Length > 50 * 1024 * 1024)
            {
                _logger.LogWarning("Attachment {FileName} exceeds 50MB limit",
                    mimePart.FileName);
                continue;
            }

            using var memoryStream = new MemoryStream();
            await mimePart.Content.DecodeToAsync(memoryStream);
            var bytes = memoryStream.ToArray();

            attachments.Add(new AttachmentDto
            {
                FileName = mimePart.FileName ?? "untitled",
                ContentType = mimePart.ContentType.MimeType,
                Size = bytes.Length,
                ContentBase64 = Convert.ToBase64String(bytes),
                ContentId = mimePart.ContentId,
                IsInline = mimePart.IsAttachment == false
            });
        }
    }

    return Ok(new MailMessageDetailResponse
    {
        // ... 既存フィールド ...
        Attachments = attachments  // ✅ 新規
    });
}
```

#### 3.2.4 セキュリティ実装

**ファイルサイズ制限**:
```csharp
private const long MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024; // 50MB
```

**危険なMIMEタイプのブロック**:
```csharp
private static readonly HashSet<string> BLOCKED_MIME_TYPES = new()
{
    "application/x-msdownload",  // .exe
    "application/x-executable",
    "application/x-bat",
    "application/x-sh",
    "text/x-script.python"
};

// チェックロジック
if (BLOCKED_MIME_TYPES.Contains(mimePart.ContentType.MimeType))
{
    _logger.LogWarning("Blocked dangerous attachment: {Type}",
        mimePart.ContentType.MimeType);
    continue;
}
```

**ファイル名サニタイズ**:
```csharp
private static string SanitizeFileName(string fileName)
{
    // パストラバーサル防止
    fileName = Path.GetFileName(fileName);

    // 危険な文字を除去
    var invalid = Path.GetInvalidFileNameChars();
    return string.Join("_", fileName.Split(invalid));
}
```

---

### 3.3 フロントエンド設計

#### 3.3.1 型定義拡張: TypeScript Interface

**ファイルパス**: `maildeck-ui/src/components/MailDetailModal.tsx`

```typescript
interface Attachment {
    fileName: string;
    contentType: string;
    size: number;
    contentBase64: string;
    contentId?: string;
    isInline: boolean;
}

interface MessageDetail {
    // ... 既存フィールド ...
    attachments: Attachment[];  // ✅ 新規
}
```

#### 3.3.2 UIコンポーネント: 添付ファイル一覧

**レイアウト例**:
```tsx
{/* 添付ファイルセクション */}
{messageDetail.attachments && messageDetail.attachments.length > 0 && (
    <div className="border-t pt-4 mt-4">
        <h3 className="text-sm font-medium text-gray-700 mb-2">
            添付ファイル ({messageDetail.attachments.length})
        </h3>
        <div className="space-y-2">
            {messageDetail.attachments
                .filter(att => !att.isInline)  // インライン画像を除外
                .map((attachment, index) => (
                    <AttachmentItem
                        key={index}
                        attachment={attachment}
                    />
                ))}
        </div>
    </div>
)}
```

#### 3.3.3 UIコンポーネント: 添付ファイルアイテム

**新規コンポーネント**: `AttachmentItem.tsx`

```tsx
interface AttachmentItemProps {
    attachment: Attachment;
}

function AttachmentItem({ attachment }: AttachmentItemProps) {
    const handleDownload = () => {
        // Base64をBlobに変換
        const byteCharacters = atob(attachment.contentBase64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: attachment.contentType });

        // ダウンロードリンク生成
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = attachment.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
            <div className="flex items-center gap-3">
                {/* ファイルアイコン */}
                <FileIcon contentType={attachment.contentType} />

                {/* ファイル情報 */}
                <div>
                    <p className="text-sm font-medium text-gray-900">
                        {attachment.fileName}
                    </p>
                    <p className="text-xs text-gray-500">
                        {formatFileSize(attachment.size)}
                    </p>
                </div>
            </div>

            {/* ダウンロードボタン */}
            <button
                onClick={handleDownload}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition"
            >
                ダウンロード
            </button>
        </div>
    );
}
```

#### 3.3.4 ユーティリティ関数

**ファイルサイズ表示**:
```typescript
function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
```

**ファイルアイコン判定**:
```typescript
function FileIcon({ contentType }: { contentType: string }) {
    if (contentType.startsWith('image/')) {
        return <ImageIcon className="w-6 h-6 text-blue-500" />;
    } else if (contentType === 'application/pdf') {
        return <DocumentTextIcon className="w-6 h-6 text-red-500" />;
    } else if (contentType.startsWith('video/')) {
        return <FilmIcon className="w-6 h-6 text-purple-500" />;
    } else {
        return <DocumentIcon className="w-6 h-6 text-gray-500" />;
    }
}
```

---

## 4. セキュリティ考慮事項

### 4.1 脅威モデル

| 脅威 | 対策 | 実装箇所 |
|------|------|----------|
| **大容量ファイルによるDoS** | 50MB制限、タイムアウト | `MailController.cs` |
| **実行可能ファイルの配布** | 危険なMIMEタイプブロック | `MailController.cs` |
| **パストラバーサル攻撃** | ファイル名サニタイズ | `SanitizeFileName()` |
| **XSS（ファイル名経由）** | React自動エスケープ | `AttachmentItem.tsx` |
| **メモリ枯渇** | ストリーミング処理、メモリ解放 | `using` ステートメント |
| **CSRF** | JWT Bearer認証 | 既存実装 |

### 4.2 プライバシー保護

**データ保存ポリシー**:
- ❌ **添付ファイルをDBに保存しない**（揮発性、IMAP都度取得）
- ✅ メタデータのみをレスポンスに含める
- ✅ ダウンロード後、ブラウザキャッシュから即時削除（`URL.revokeObjectURL`）

**ログ戦略**:
```csharp
// ✅ Good: ファイル名とサイズのみログ
_logger.LogInformation("Downloaded attachment: {FileName}, {Size} bytes",
    fileName, size);

// ❌ Bad: ファイル内容をログに記録しない
_logger.LogDebug("File content: {Content}", contentBase64);  // 禁止
```

---

## 5. 実装手順

### Phase 1: バックエンド実装

#### Step 1.1: モデル作成
- [ ] `AttachmentDto.cs` 作成
- [ ] `MailMessageDetailResponse.cs` に `Attachments` プロパティ追加

#### Step 1.2: コントローラー変更
- [ ] `GetMessage` メソッドに添付ファイル処理追加
- [ ] セキュリティチェック実装（サイズ、MIMEタイプ）
- [ ] ファイル名サニタイズ実装
- [ ] エラーハンドリング（巨大ファイル、破損ファイル）

#### Step 1.3: ログ追加
- [ ] Serilogで添付ファイル処理のログ記録
- [ ] パフォーマンスメトリクス（ファイルエンコード時間）

#### Step 1.4: テスト
- [ ] 手動テスト: Gmail添付ファイル（PDF, 画像, ZIP）
- [ ] 手動テスト: 50MB超ファイルの拒否確認
- [ ] 手動テスト: 危険なMIMEタイプのブロック確認

---

### Phase 2: フロントエンド実装

#### Step 2.1: 型定義
- [ ] `Attachment` インターフェース追加
- [ ] `MessageDetail` に `attachments` フィールド追加

#### Step 2.2: UIコンポーネント
- [ ] `AttachmentItem.tsx` 作成
- [ ] `MailDetailModal.tsx` に添付ファイルセクション追加
- [ ] ファイルアイコンコンポーネント実装

#### Step 2.3: ダウンロード機能
- [ ] Base64 → Blob変換実装
- [ ] ダウンロードハンドラー実装
- [ ] メモリリーク防止（URL.revokeObjectURL）

#### Step 2.4: スタイリング
- [ ] Tailwind CSSでレスポンシブデザイン
- [ ] ホバーエフェクト、ローディング状態

#### Step 2.5: テスト
- [ ] 複数添付ファイルの表示確認
- [ ] ダウンロード動作確認（Chrome, Firefox, Safari）
- [ ] モバイル表示確認

---

### Phase 3: 統合テスト & デプロイ

#### Step 3.1: 統合テスト
- [ ] E2Eテスト: メール取得 → 添付ファイル表示 → ダウンロード
- [ ] パフォーマンステスト: 10MB添付ファイルのレスポンス時間

#### Step 3.2: ドキュメント更新
- [ ] `CLAUDE.md` のAPIエンドポイント表に追記
- [ ] `README.md` に機能説明追加
- [ ] APIドキュメント（Swagger/OpenAPI）更新

#### Step 3.3: デプロイ
- [ ] フロントエンド: `npm run build` → Cloudflare Pages
- [ ] バックエンド: `dotnet build` → systemd再起動
- [ ] 本番環境での動作確認

---

## 6. パフォーマンス最適化

### 6.1 現在の懸念事項

**問題**: 大容量添付ファイルのBase64エンコードでメモリ消費が増加

**解決策（Phase 1）**:
```csharp
// 現在の実装（全てメモリ展開）
var bytes = memoryStream.ToArray();
var base64 = Convert.ToBase64String(bytes);
```

**将来の最適化（Phase 3）**:
- ストリーミングダウンロード: チャンク分割
- 添付ファイル専用エンドポイント: `/api/mail/attachment/{messageId}/{attachmentIndex}`
- Content-Dispositionヘッダーでブラウザダウンロード

### 6.2 キャッシュ戦略

**検討事項**:
- IMAPから都度取得（現行）vs Redis/S3キャッシュ（将来）
- トレードオフ: ストレージコスト vs API応答速度

---

## 7. 将来の拡張性

### 7.1 送信時の添付ファイル（Phase 2）

**変更点**:
- `ComposeModal.tsx`: ファイル入力フィールド追加
- `EmailRequest.cs`: `List<AttachmentDto>` 追加
- `SendEmail` メソッド: `MimeMessage.Attachments.Add()` 実装

### 7.2 添付ファイルプレビュー（Phase 3）

**実装案**:
- 画像: `<img src="data:image/png;base64,..." />`
- PDF: PDF.js統合
- テキスト: Monaco Editorでシンタックスハイライト

### 7.3 検索フィルター（Phase 3）

**APIクエリ例**:
```
GET /api/mail/inbox?hasAttachment=true
GET /api/mail/inbox?attachmentType=image
```

---

## 8. リスク管理

| リスク | 影響 | 対策 |
|--------|------|------|
| **巨大ファイルでメモリ不足** | 中 | 50MB制限、ストリーミング検討 |
| **IMAPタイムアウト** | 中 | タイムアウト設定追加、非同期処理 |
| **MIMEパースエラー** | 低 | try-catchでエラーハンドリング |
| **ブラウザ互換性問題** | 低 | クロスブラウザテスト実施 |
| **Base64エンコードの肥大化** | 低 | 33%増加は許容範囲（REST APIとして一般的） |

---

## 9. 成功指標

### 9.1 機能要件
- ✅ 添付ファイル数が正しく表示される
- ✅ ファイル名、サイズ、タイプが正確
- ✅ ダウンロードしたファイルが開ける

### 9.2 非機能要件
- ✅ 10MBファイルのダウンロードが5秒以内
- ✅ 50MBファイルが正しくブロックされる
- ✅ 実行可能ファイルがブロックされる

### 9.3 UX要件
- ✅ ファイルアイコンで視認性向上
- ✅ モバイルでもダウンロード可能
- ✅ ローディング状態が明確

---

## 10. まとめ

### 10.1 実装優先度
1. **High**: バックエンドの添付ファイル抽出（MailKit）
2. **High**: フロントエンドの一覧表示とダウンロード
3. **Medium**: セキュリティチェック（サイズ、MIMEタイプ）
4. **Low**: プレビュー機能、検索フィルター

### 10.2 タイムライン見積もり
- **Phase 1（ダウンロード機能）**: 本PR
- **Phase 2（送信機能）**: 別PR
- **Phase 3（高度な機能）**: 将来のイテレーション

### 10.3 関連ドキュメント
- [CLAUDE.md](../CLAUDE.md): プロジェクト概要
- [MailKit Documentation](https://github.com/jstedfast/MailKit): MIME処理
- [MDN Web Docs: Blob API](https://developer.mozilla.org/en-US/docs/Web/API/Blob): ダウンロード実装

---

**計画書作成者**: Claude Code
**レビュアー**: @shuitshuit
**承認日**: TBD
