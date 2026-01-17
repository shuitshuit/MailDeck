# スマートラベル機能 設計書

## 概要

スマートラベルは、ユーザーが定義したルールや機械学習に基づいて、新着メールに自動的にラベルを付与する機能です。

## 実現方法の3つのアプローチ

### アプローチ1: ルールベース自動ラベリング【Phase 1 - 推奨】

最もシンプルで実装しやすく、ユーザーが完全にコントロールできる方法。

#### 特徴
- ✅ 実装が容易
- ✅ 動作が透明で予測可能
- ✅ 外部依存なし
- ✅ リアルタイム処理可能
- ❌ ユーザーが手動でルール設定が必要

#### 動作フロー
1. ユーザーが「ラベルルール」を作成
2. 新着メール受信時、各ルールを評価
3. 条件にマッチすればラベル自動付与
4. ルールは優先順位順に適用

---

### アプローチ2: ML.NET機械学習ベース【Phase 2 - 中期目標】

ユーザーの手動ラベリング履歴から学習し、新着メールを自動分類。

#### 特徴
- ✅ .NET環境にネイティブ統合（ML.NET）
- ✅ オンプレミスで完結（プライバシー保護）
- ✅ ユーザー固有のパターン学習
- ❌ 学習データが必要（最低100件程度）
- ❌ モデル訓練に計算リソース必要

#### 動作フロー
1. ユーザーが手動でメールにラベル付け（学習データ蓄積）
2. 定期的にML.NETモデルを訓練
3. 新着メール受信時、モデルで分類予測
4. 信頼度が閾値以上ならラベル自動付与

---

### アプローチ3: 外部AIサービス統合【Phase 3 - 将来拡張】

Claude APIやOpenAI GPTなどのLLMを活用した高度な分類。

#### 特徴
- ✅ 最も高精度な分類
- ✅ 自然言語での条件指定可能
- ✅ 少量データでも動作
- ❌ 外部API依存（コスト、レイテンシ）
- ❌ プライバシー懸念（メール内容を外部送信）

#### 動作フロー
1. ユーザーがラベルの説明を自然言語で記述
2. 新着メール受信時、API経由で分類依頼
3. AIが適切なラベルを提案
4. ユーザー確認後に付与

---

## Phase 1: ルールベース実装（詳細設計）

### データベーススキーマ

#### label_rules テーブル

```sql
CREATE TABLE label_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, -- ルール名（例: "仕事メール"）
    priority INT NOT NULL DEFAULT 0, -- 優先順位（大きいほど優先）
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,

    -- 条件フィールド（JSON or 個別カラム）
    condition_type VARCHAR(20) NOT NULL, -- 'simple' or 'advanced'

    -- シンプル条件（すべてAND条件）
    from_contains TEXT, -- 送信者アドレス/名前に含む文字列
    to_contains TEXT, -- 宛先に含む文字列
    subject_contains TEXT, -- 件名に含む文字列
    body_contains TEXT, -- 本文に含む文字列
    has_attachments BOOLEAN, -- 添付ファイルあり/なし

    -- 高度な条件（JSON形式）
    advanced_conditions JSONB, -- 複雑なAND/OR条件

    -- 自動削除設定
    auto_archive BOOLEAN DEFAULT FALSE, -- ラベル付与後にアーカイブ

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_label_rules_user_id ON label_rules(user_id);
CREATE INDEX idx_label_rules_label_id ON label_rules(label_id);
CREATE INDEX idx_label_rules_priority ON label_rules(priority DESC);
```

#### advanced_conditions JSONB 形式例

```json
{
  "operator": "AND",
  "conditions": [
    {
      "field": "from",
      "operator": "contains",
      "value": "example.com"
    },
    {
      "operator": "OR",
      "conditions": [
        {
          "field": "subject",
          "operator": "regex",
          "value": "^\\[重要\\]"
        },
        {
          "field": "body",
          "operator": "contains",
          "value": "至急"
        }
      ]
    }
  ]
}
```

### バックエンド実装

#### Models/LabelRule.cs

```csharp
public class LabelRule
{
    public Guid Id { get; set; }
    public string UserId { get; set; } = string.Empty;
    public Guid LabelId { get; set; }
    public string Name { get; set; } = string.Empty;
    public int Priority { get; set; } = 0;
    public bool IsEnabled { get; set; } = true;

    public string ConditionType { get; set; } = "simple"; // "simple" or "advanced"

    // シンプル条件
    public string? FromContains { get; set; }
    public string? ToContains { get; set; }
    public string? SubjectContains { get; set; }
    public string? BodyContains { get; set; }
    public bool? HasAttachments { get; set; }

    // 高度な条件
    public string? AdvancedConditions { get; set; } // JSON文字列

    public bool AutoArchive { get; set; } = false;

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
```

#### Services/LabelRuleService.cs

```csharp
public class LabelRuleService
{
    private readonly IShuitNetDatabase _db;

    public async Task<List<Guid>> EvaluateRulesForMessageAsync(
        string userId,
        MimeMessage message,
        Guid serverConfigId)
    {
        // 1. ユーザーの有効なルールを優先順位順に取得
        var rules = await _db.SelectAsync<LabelRule>(
            "WHERE user_id = @UserId AND is_enabled = TRUE ORDER BY priority DESC",
            new { UserId = userId }
        );

        var matchedLabelIds = new List<Guid>();

        foreach (var rule in rules)
        {
            if (await EvaluateRule(rule, message))
            {
                matchedLabelIds.Add(rule.LabelId);
            }
        }

        return matchedLabelIds;
    }

    private async Task<bool> EvaluateRule(LabelRule rule, MimeMessage message)
    {
        if (rule.ConditionType == "simple")
        {
            return EvaluateSimpleConditions(rule, message);
        }
        else
        {
            return EvaluateAdvancedConditions(rule, message);
        }
    }

    private bool EvaluateSimpleConditions(LabelRule rule, MimeMessage message)
    {
        // AND条件ですべてチェック
        if (rule.FromContains != null)
        {
            var from = message.From.ToString().ToLower();
            if (!from.Contains(rule.FromContains.ToLower()))
                return false;
        }

        if (rule.ToContains != null)
        {
            var to = message.To.ToString().ToLower();
            if (!to.Contains(rule.ToContains.ToLower()))
                return false;
        }

        if (rule.SubjectContains != null)
        {
            var subject = message.Subject?.ToLower() ?? "";
            if (!subject.Contains(rule.SubjectContains.ToLower()))
                return false;
        }

        if (rule.BodyContains != null)
        {
            var body = message.TextBody?.ToLower() ?? message.HtmlBody?.ToLower() ?? "";
            if (!body.Contains(rule.BodyContains.ToLower()))
                return false;
        }

        if (rule.HasAttachments.HasValue)
        {
            var hasAttach = message.Attachments.Any();
            if (hasAttach != rule.HasAttachments.Value)
                return false;
        }

        return true; // すべての条件を満たした
    }

    private bool EvaluateAdvancedConditions(LabelRule rule, MimeMessage message)
    {
        // TODO: JSONをパースしてAND/OR/正規表現を評価
        // 複雑なロジックが必要なため、Phase 1.5で実装
        return false;
    }
}
```

#### EmailCheckBackgroundService への統合

```csharp
// EmailCheckBackgroundService.cs の新着チェック部分に追加

var labelRuleService = serviceScope.ServiceProvider.GetRequiredService<LabelRuleService>();

foreach (var newMessage in newMessages)
{
    // スマートラベル評価
    var labelIds = await labelRuleService.EvaluateRulesForMessageAsync(
        config.UserId,
        newMessage.Message,
        config.Id
    );

    // ラベル自動付与
    foreach (var labelId in labelIds)
    {
        var mailLabel = new MailLabel
        {
            Id = Guid.NewGuid(),
            UserId = config.UserId,
            MessageId = newMessage.Message.MessageId,
            LabelId = labelId,
            ServerConfigId = config.Id,
            CreatedAt = DateTime.UtcNow
        };

        await db.InsertAsync(mailLabel);
    }
}
```

#### Controllers/LabelRulesController.cs

エンドポイント:
- `GET /api/labelrules` - ルール一覧取得
- `POST /api/labelrules` - ルール作成
- `PUT /api/labelrules/{id}` - ルール更新
- `DELETE /api/labelrules/{id}` - ルール削除
- `POST /api/labelrules/{id}/test` - ルールのテスト実行（既存メールで試行）

### フロントエンド実装

#### 新規コンポーネント

1. **LabelRuleModal.tsx**
   - ルール作成/編集UI
   - シンプルモード: フォーム入力
   - 高度なモード: 条件ビルダー

2. **LabelRuleList.tsx**
   - ルール一覧表示
   - 優先順位の並び替え（ドラッグ&ドロップ）
   - 有効/無効トグル

3. **RuleTestPanel.tsx**
   - ルールのプレビュー
   - 「このルールは過去30日で○件にマッチします」

#### UI/UX

```
┌─ ラベルルール作成 ─────────────────┐
│                                    │
│ ルール名: [仕事メール___________]  │
│ 適用ラベル: [🏢 仕事 ▼]           │
│                                    │
│ ┌─ 条件 ──────────────────────┐  │
│ │ モード: ○ シンプル ○ 高度    │  │
│ │                              │  │
│ │ 送信者に含む:                │  │
│ │ [@company.com____________]   │  │
│ │                              │  │
│ │ 件名に含む:                  │  │
│ │ [会議_____________________]   │  │
│ │                              │  │
│ │ ☑ 添付ファイルあり           │  │
│ └──────────────────────────────┘  │
│                                    │
│ 優先順位: [10_____]                │
│ ☑ 有効にする                       │
│                                    │
│ [テスト実行] [キャンセル] [保存]   │
└────────────────────────────────────┘
```

---

## Phase 2: ML.NET機械学習実装（概要）

### 技術スタック

- **ML.NET**: Microsoft製の.NET用機械学習ライブラリ
- **アルゴリズム**: テキスト分類（Multiclass Classification）
- **モデル**: FastTree, LightGBM, または SDCA

### 実装フロー

#### 1. 学習データ収集

```csharp
// 学習データのスキーマ
public class MailTrainingData
{
    public string From { get; set; }
    public string Subject { get; set; }
    public string Body { get; set; }
    public string Label { get; set; } // ラベル名
}
```

#### 2. モデル訓練

```csharp
public class SmartLabelTrainingService
{
    public async Task TrainModelAsync(string userId)
    {
        var mlContext = new MLContext();

        // 1. ユーザーの手動ラベリングデータ取得
        var trainingData = await GetTrainingDataAsync(userId);

        if (trainingData.Count < 100)
        {
            throw new InvalidOperationException("学習データが不足しています（最低100件必要）");
        }

        var dataView = mlContext.Data.LoadFromEnumerable(trainingData);

        // 2. パイプライン構築
        var pipeline = mlContext.Transforms.Text
            .FeaturizeText("FromFeaturized", nameof(MailTrainingData.From))
            .Append(mlContext.Transforms.Text.FeaturizeText("SubjectFeaturized", nameof(MailTrainingData.Subject)))
            .Append(mlContext.Transforms.Text.FeaturizeText("BodyFeaturized", nameof(MailTrainingData.Body)))
            .Append(mlContext.Transforms.Concatenate("Features", "FromFeaturized", "SubjectFeaturized", "BodyFeaturized"))
            .Append(mlContext.Transforms.Conversion.MapValueToKey("Label"))
            .Append(mlContext.MulticlassClassification.Trainers.SdcaMaximumEntropy())
            .Append(mlContext.Transforms.Conversion.MapKeyToValue("PredictedLabel"));

        // 3. 訓練
        var model = pipeline.Fit(dataView);

        // 4. モデル保存
        var modelPath = $"models/user_{userId}_smart_label.zip";
        mlContext.Model.Save(model, dataView.Schema, modelPath);
    }
}
```

#### 3. 予測実行

```csharp
public class SmartLabelPredictionService
{
    public async Task<List<LabelPrediction>> PredictLabelsAsync(string userId, MimeMessage message)
    {
        var mlContext = new MLContext();
        var modelPath = $"models/user_{userId}_smart_label.zip";

        if (!File.Exists(modelPath))
        {
            return new List<LabelPrediction>(); // モデル未訓練
        }

        var model = mlContext.Model.Load(modelPath, out var schema);
        var predictionEngine = mlContext.Model.CreatePredictionEngine<MailTrainingData, LabelPredictionResult>(model);

        var input = new MailTrainingData
        {
            From = message.From.ToString(),
            Subject = message.Subject ?? "",
            Body = message.TextBody ?? message.HtmlBody ?? ""
        };

        var result = predictionEngine.Predict(input);

        // 信頼度が0.7以上のラベルのみ返す
        return result.Score
            .Select((score, index) => new LabelPrediction
            {
                LabelName = result.Labels[index],
                Confidence = score
            })
            .Where(p => p.Confidence >= 0.7)
            .ToList();
    }
}
```

#### 4. バックグラウンドタスク

- 週次でモデル再訓練（新しいラベリングデータを反映）
- 新着メール受信時に予測実行
- ユーザーが予測を承認/拒否 → フィードバック学習

---

## Phase 3: 外部AIサービス統合（概要）

### Claude API / OpenAI GPT統合

```csharp
public class AiLabelPredictionService
{
    private readonly HttpClient _httpClient;

    public async Task<List<string>> PredictLabelsWithAiAsync(
        string userId,
        MimeMessage message,
        List<Label> availableLabels)
    {
        var prompt = $@"
以下のメールを分析し、適切なラベルを選択してください。

利用可能なラベル:
{string.Join("\n", availableLabels.Select(l => $"- {l.Name}"))}

メール情報:
送信者: {message.From}
件名: {message.Subject}
本文: {message.TextBody?.Substring(0, Math.Min(500, message.TextBody.Length))}

JSON形式で、適用すべきラベル名の配列を返してください。
例: {{\"labels\": [\"仕事\", \"重要\"]}}
";

        var request = new
        {
            model = "claude-sonnet-4.5",
            max_tokens = 200,
            messages = new[]
            {
                new { role = "user", content = prompt }
            }
        };

        var response = await _httpClient.PostAsJsonAsync("https://api.anthropic.com/v1/messages", request);
        var result = await response.Content.ReadFromJsonAsync<ClaudeResponse>();

        // JSONパースしてラベル抽出
        var labels = JsonSerializer.Deserialize<LabelResponse>(result.Content[0].Text);
        return labels.Labels;
    }
}
```

### プライバシー保護オプション

- メール本文の最初500文字のみ送信
- 件名と送信者のみで分類（本文は送信しない）
- オプトイン方式（ユーザーが明示的に有効化）

---

## 推奨実装ロードマップ

### 🎯 Phase 1: ルールベース（今すぐ実装可能）
- **期間**: 2-3日
- **複雑度**: 低
- **ユーザーメリット**: 即座に自動化可能

### 🎯 Phase 1.5: 高度なルール（中期）
- **期間**: 1-2日
- **追加機能**: 正規表現、AND/OR条件、除外ルール

### 🎯 Phase 2: ML.NET統合（長期）
- **期間**: 1-2週間
- **前提条件**: 十分な学習データ蓄積（ユーザーあたり100件以上）
- **複雑度**: 中

### 🎯 Phase 3: AI統合（将来検討）
- **期間**: 3-5日
- **前提条件**: ユーザーのオプトイン、API予算
- **複雑度**: 低（APIラッパーのみ）

---

## まとめ

### 最優先実装: Phase 1 ルールベース

**理由**:
1. ✅ すぐに実用的
2. ✅ 動作が透明
3. ✅ 外部依存なし
4. ✅ プライバシー完全保護

**次のステップ**:
- `label_rules` テーブル追加
- `LabelRuleService` 実装
- `EmailCheckBackgroundService` 統合
- フロントエンドUIでルール設定画面

ML.NET統合は、ユーザーベースが成長し、十分な学習データが蓄積された後に検討するのが最適です。
