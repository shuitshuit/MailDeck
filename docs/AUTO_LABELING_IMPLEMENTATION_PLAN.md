# 自動ラベリング機能 実装計画書

**作成日**: 2026-01-13
**ブランチ**: `feature/auto-labeling`
**担当**: Claude Sonnet 4.5

---

## 1. 機能概要

### 目的
ユーザーが設定したルールに基づいて、新着メールに自動的にラベルを付与する機能を実装する。

### 主要機能
1. **自動ラベリングルール管理**
   - ルールの作成・編集・削除
   - 優先度設定
   - 有効/無効の切り替え

2. **ルール条件**
   - 送信者（From）でマッチング
   - 件名（Subject）でマッチング
   - 本文キーワードでマッチング
   - 複数条件のAND/OR指定

3. **非同期処理**
   - `System.Threading.Channels`を使用したキューイング
   - EmailCheckBackgroundServiceとの統合
   - バックグラウンドでルール評価・ラベル付与

---

## 2. アーキテクチャ設計

### 2.1 システム構成図

```
EmailCheckBackgroundService
  ↓ 新着メール検出
  ↓
Channel<NewEmailNotification>
  ↓ (Producer)
  |
  ↓ (Consumer)
AutoLabelingService
  ↓ ルール取得（DB）
  ↓ 条件評価
  ↓ ラベル付与（API呼び出し）
  ↓
PostgreSQL (message_labels更新)
```

### 2.2 コンポーネント構成

#### バックエンド (.NET)
- **ChannelService**: Channel管理クラス
- **AutoLabelingService**: ルール評価・ラベル付与ロジック
- **AutoLabelingRulesController**: ルールCRUD API
- **Models/AutoLabelingRule**: ルールエンティティ

#### フロントエンド (React)
- **AutoLabelingPage**: ルール管理画面
- **AutoLabelingRuleModal**: ルール作成・編集モーダル
- **RuleConditionBuilder**: 条件ビルダーUI

---

## 3. データベーススキーマ

### 3.1 新規テーブル: `auto_labeling_rules`

```sql
CREATE TABLE auto_labeling_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    rule_name VARCHAR(255) NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0, -- 高い数値ほど優先
    is_enabled BOOLEAN NOT NULL DEFAULT true,

    -- 条件（JSON形式）
    conditions JSONB NOT NULL,
    -- 例:
    -- {
    --   "operator": "AND",
    --   "rules": [
    --     { "field": "from", "operator": "contains", "value": "example.com" },
    --     { "field": "subject", "operator": "contains", "value": "重要" }
    --   ]
    -- }

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_rule_name_per_user UNIQUE (user_id, rule_name)
);

CREATE INDEX idx_auto_labeling_rules_user_enabled
    ON auto_labeling_rules(user_id, is_enabled, priority DESC);
```

### 3.2 マイグレーションファイル

`database/migrations/005_auto_labeling_rules.sql`

---

## 4. バックエンド実装

### 4.1 新規ファイル構成

```
MailDeck.Api/
├── Services/
│   ├── ChannelService.cs              (NEW)
│   ├── AutoLabelingService.cs         (NEW)
│   └── EmailCheckBackgroundService.cs (MODIFY)
├── Controllers/
│   └── AutoLabelingRulesController.cs (NEW)
├── Models/
│   ├── AutoLabelingRule.cs            (NEW)
│   └── NewEmailNotification.cs        (NEW)
└── DTOs/
    ├── AutoLabelingRuleDto.cs         (NEW)
    └── RuleConditionDto.cs            (NEW)
```

### 4.2 実装詳細

#### 4.2.1 ChannelService.cs

```csharp
public class ChannelService
{
    private readonly Channel<NewEmailNotification> _channel;

    public ChannelService()
    {
        _channel = Channel.CreateUnbounded<NewEmailNotification>(
            new UnboundedChannelOptions
            {
                SingleReader = false,
                SingleWriter = false
            }
        );
    }

    public ChannelWriter<NewEmailNotification> Writer => _channel.Writer;
    public ChannelReader<NewEmailNotification> Reader => _channel.Reader;
}

public record NewEmailNotification(
    string UserId,
    string ConfigId,
    int MessageId,
    string From,
    string Subject,
    string BodyText
);
```

#### 4.2.2 AutoLabelingService.cs

```csharp
public class AutoLabelingService : BackgroundService
{
    private readonly ChannelService _channelService;
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<AutoLabelingService> _logger;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var notification in _channelService.Reader.ReadAllAsync(stoppingToken))
        {
            try
            {
                await ProcessEmailAsync(notification, stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to process auto-labeling for message {MessageId}",
                    notification.MessageId);
            }
        }
    }

    private async Task ProcessEmailAsync(NewEmailNotification notification, CancellationToken ct)
    {
        using var scope = _serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<NpgsqlConnection>();

        // 1. ユーザーのルール取得（優先度順、有効のみ）
        var rules = await db.SelectAsync<AutoLabelingRule>(
            "WHERE user_id = @UserId AND is_enabled = true ORDER BY priority DESC",
            new { notification.UserId }
        );

        // 2. 各ルールを評価
        foreach (var rule in rules)
        {
            if (EvaluateRule(rule, notification))
            {
                // 3. ラベル付与
                await AddLabelToMessageAsync(notification.MessageId, rule.LabelId,
                    notification.ConfigId, db);

                _logger.LogInformation(
                    "Auto-labeled message {MessageId} with label {LabelId} by rule {RuleName}",
                    notification.MessageId, rule.LabelId, rule.RuleName
                );
            }
        }
    }

    private bool EvaluateRule(AutoLabelingRule rule, NewEmailNotification notification)
    {
        var conditions = JsonSerializer.Deserialize<RuleConditions>(rule.Conditions);
        return EvaluateConditions(conditions, notification);
    }

    private bool EvaluateConditions(RuleConditions conditions, NewEmailNotification notification)
    {
        var results = conditions.Rules.Select(r => EvaluateSingleCondition(r, notification));

        return conditions.Operator == "AND"
            ? results.All(r => r)
            : results.Any(r => r);
    }

    private bool EvaluateSingleCondition(RuleCondition condition, NewEmailNotification notification)
    {
        var value = condition.Field switch
        {
            "from" => notification.From,
            "subject" => notification.Subject,
            "body" => notification.BodyText,
            _ => ""
        };

        return condition.Operator switch
        {
            "contains" => value.Contains(condition.Value, StringComparison.OrdinalIgnoreCase),
            "equals" => value.Equals(condition.Value, StringComparison.OrdinalIgnoreCase),
            "startsWith" => value.StartsWith(condition.Value, StringComparison.OrdinalIgnoreCase),
            "endsWith" => value.EndsWith(condition.Value, StringComparison.OrdinalIgnoreCase),
            _ => false
        };
    }
}
```

#### 4.2.3 EmailCheckBackgroundService.cs 修正

```csharp
// 既存のEmailCheckBackgroundServiceに追加
private readonly ChannelService _channelService;

// メール検出時にChannelへ送信
foreach (var newMessage in newMessages)
{
    await _channelService.Writer.WriteAsync(new NewEmailNotification(
        UserId: userId,
        ConfigId: config.Id,
        MessageId: newMessage.Uid,
        From: newMessage.From,
        Subject: newMessage.Subject,
        BodyText: newMessage.TextBody ?? ""
    ));
}
```

#### 4.2.4 AutoLabelingRulesController.cs

```csharp
[ApiController]
[Route("api/autolabeling")]
[Authorize]
public class AutoLabelingRulesController : ControllerBase
{
    // GET /api/autolabeling
    [HttpGet]
    public async Task<IActionResult> GetRules()
    {
        var userId = User.FindFirst("sub")?.Value;
        var rules = await _db.SelectAsync<AutoLabelingRule>(
            "WHERE user_id = @UserId ORDER BY priority DESC",
            new { UserId = userId }
        );
        return Ok(rules);
    }

    // POST /api/autolabeling
    [HttpPost]
    public async Task<IActionResult> CreateRule([FromBody] CreateRuleDto dto)
    {
        var userId = User.FindFirst("sub")?.Value;
        var rule = new AutoLabelingRule
        {
            Id = Guid.NewGuid().ToString(),
            UserId = userId,
            LabelId = dto.LabelId,
            RuleName = dto.RuleName,
            Priority = dto.Priority,
            IsEnabled = true,
            Conditions = JsonSerializer.Serialize(dto.Conditions)
        };

        await _db.InsertAsync(rule);
        return Ok(rule);
    }

    // PUT /api/autolabeling/{id}
    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateRule(string id, [FromBody] UpdateRuleDto dto)
    {
        // 更新処理
    }

    // DELETE /api/autolabeling/{id}
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteRule(string id)
    {
        // 削除処理
    }

    // POST /api/autolabeling/{id}/toggle
    [HttpPost("{id}/toggle")]
    public async Task<IActionResult> ToggleRule(string id)
    {
        // 有効/無効切り替え
    }
}
```

---

## 5. フロントエンド実装

### 5.1 新規ファイル構成

```
maildeck-ui/src/
├── pages/
│   └── AutoLabelingPage.tsx          (NEW)
├── components/
│   ├── AutoLabelingRuleCard.tsx      (NEW)
│   ├── AutoLabelingRuleModal.tsx     (NEW)
│   └── RuleConditionBuilder.tsx      (NEW)
├── types/
│   └── autoLabeling.ts               (NEW)
└── lib/
    └── api.ts                        (MODIFY - API関数追加)
```

### 5.2 UI設計

#### 5.2.1 AutoLabelingPage.tsx

```tsx
// ルール一覧表示画面
// - ルールカード（優先度順）
// - 新規作成ボタン
// - 有効/無効トグル
// - 編集・削除ボタン
```

#### 5.2.2 RuleConditionBuilder.tsx

```tsx
// 条件ビルダーUI
// - フィールド選択（From/Subject/Body）
// - 演算子選択（contains/equals/startsWith/endsWith）
// - 値入力
// - AND/OR演算子
// - 条件追加・削除ボタン
```

### 5.3 API統合

```typescript
// lib/api.ts
export async function getAutoLabelingRules(): Promise<AutoLabelingRule[]> {
  return authFetch('/api/autolabeling');
}

export async function createAutoLabelingRule(dto: CreateRuleDto): Promise<AutoLabelingRule> {
  return authFetch('/api/autolabeling', {
    method: 'POST',
    body: JSON.stringify(dto)
  });
}
```

---

## 6. 実装ステップ

### Phase 1: バックエンド基盤 (1日目)
- [ ] データベーススキーマ作成・マイグレーション
- [ ] ChannelService実装
- [ ] NewEmailNotification型定義
- [ ] AutoLabelingRule モデル作成

### Phase 2: 自動ラベリングロジック (2日目)
- [ ] AutoLabelingService実装
  - [ ] Channel Consumer
  - [ ] ルール評価エンジン
  - [ ] ラベル付与処理
- [ ] EmailCheckBackgroundService修正（Channel Producer追加）
- [ ] ログ記録

### Phase 3: API実装 (3日目)
- [ ] AutoLabelingRulesController実装
  - [ ] GET /api/autolabeling
  - [ ] POST /api/autolabeling
  - [ ] PUT /api/autolabeling/{id}
  - [ ] DELETE /api/autolabeling/{id}
  - [ ] POST /api/autolabeling/{id}/toggle
- [ ] API テスト

### Phase 4: フロントエンド実装 (4-5日目)
- [ ] 型定義作成（types/autoLabeling.ts）
- [ ] API関数実装（lib/api.ts）
- [ ] RuleConditionBuilder コンポーネント
- [ ] AutoLabelingRuleModal コンポーネント
- [ ] AutoLabelingRuleCard コンポーネント
- [ ] AutoLabelingPage ページ
- [ ] ルート追加（App.tsx）
- [ ] Settingsページにリンク追加

### Phase 5: 統合テスト (6日目)
- [ ] E2Eテスト
  - [ ] ルール作成 → メール受信 → 自動ラベリング確認
  - [ ] 複数条件（AND/OR）のテスト
  - [ ] 優先度順のテスト
- [ ] パフォーマンステスト
- [ ] エラーハンドリング確認

### Phase 6: ドキュメント・リリース (7日目)
- [ ] README更新
- [ ] API ドキュメント作成
- [ ] ユーザーガイド作成
- [ ] PRレビュー・マージ

---

## 7. 技術的考慮事項

### 7.1 パフォーマンス
- **Channel容量**: Unbounded（無制限）だが、メモリ監視必要
- **バッチ処理**: 大量メール受信時の負荷分散
- **ルールキャッシュ**: 頻繁なDB読み込み防止（IMemoryCache検討）

### 7.2 エラーハンドリング
- **Channel障害**: Channel.Writer失敗時のフォールバック
- **ルール評価エラー**: 不正なJSON条件のスキップ
- **ラベル付与失敗**: リトライロジック（3回まで）

### 7.3 セキュリティ
- **ユーザー分離**: ルールは必ずuser_idで絞り込み
- **SQL Injection**: ShuitNet.ORMのパラメータ化クエリ使用
- **条件値検証**: XSS対策（フロントエンド）

### 7.4 スケーラビリティ
- **将来拡張**:
  - 機械学習ベースの自動分類
  - 正規表現サポート
  - アクション追加（既読、アーカイブなど）

---

## 8. 成功基準

### 必須要件
- [ ] ルールの作成・編集・削除が可能
- [ ] 新着メールに自動的にラベルが付与される
- [ ] 複数条件（AND/OR）が正しく動作する
- [ ] 優先度順にルールが評価される
- [ ] 有効/無効の切り替えが機能する

### パフォーマンス目標
- [ ] 1件のメール処理時間: < 100ms
- [ ] 100件同時受信時の処理完了: < 10秒
- [ ] Channel遅延: < 1秒

### UX目標
- [ ] ルール作成が直感的（3クリック以内）
- [ ] 自動ラベリング結果が即座に反映
- [ ] エラー時に明確なメッセージ表示

---

## 9. リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| Channel処理遅延 | 中 | 非同期処理、バッファサイズ調整 |
| 不正なルール条件 | 低 | バリデーション強化、try-catch |
| メモリリーク | 高 | Channel適切なクローズ、監視 |
| 誤ラベリング | 中 | テストルール機能、手動削除可能 |

---

## 10. 今後の拡張案

1. **AI自動分類**: OpenAI APIでメール内容分析
2. **アクション拡張**: 既読化、アーカイブ、転送
3. **正規表現**: 高度なパターンマッチング
4. **スケジュール**: 特定時間帯のみ適用
5. **統計**: 自動ラベリング適用回数レポート

---

## 11. 参考資料

- [System.Threading.Channels公式ドキュメント](https://learn.microsoft.com/en-us/dotnet/core/extensions/channels)
- [MailDeck CLAUDE.md](../CLAUDE.md)
- [PostgreSQL JSONB型](https://www.postgresql.org/docs/current/datatype-json.html)

---

**承認者**: ____________
**承認日**: ____________
