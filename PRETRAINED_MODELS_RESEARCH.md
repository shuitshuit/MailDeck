# 学習済みメール分類モデル 調査結果

## 概要

既存の学習済みモデルを活用することで、ゼロから訓練する必要なく、すぐにスマートラベル機能を実装できます。

---

## 利用可能な学習済みモデル

### 🏆 推奨モデル (Hugging Face)

#### 1. **lewispons/Email-classifier-v2** ⭐ 最推奨
- **フレームワーク**: SetFit (Sentence Transformer + 分類ヘッド)
- **特徴**:
  - 少量データで高精度
  - 軽量で高速
  - 簡単に統合可能
- **カテゴリ**: Business, Shipping, Calendar, Account等
- **使用方法**: SetFitライブラリ経由でインストール
- **URL**: [lewispons/Email-classifier-v2](https://huggingface.co/lewispons/Email-classifier-v2)

#### 2. **neelblabla/email-classification-llama2-7b-peft**
- **フレームワーク**: Llama2-7b (PEFT - Parameter Efficient Fine-Tuning)
- **学習データ**: Enron labeled email dataset
- **特徴**:
  - 高精度
  - PEFTにより効率的
- **注意**: モデルサイズが大きい（7B パラメータ）
- **URL**: [neelblabla/email-classification-llama2-7b-peft](https://huggingface.co/neelblabla/email-classification-llama2-7b-peft)

#### 3. **keshavkmr076/email-classification**
- **フレームワーク**: BERT-based
- **特徴**: シンプルなBERT分類モデル
- **URL**: [keshavkmr076/email-classification](https://huggingface.co/keshavkmr076/email-classification)

#### 4. **AntiSpamInstitute/spam-detector-bert-MoE-v2.2**
- **用途**: スパム検出専用
- **フレームワーク**: BERT (12 transformer layers)
- **精度**: 98.67%
- **特徴**: メールフィルタリングに特化
- **URL**: [AntiSpamInstitute/spam-detector-bert-MoE-v2.2](https://huggingface.co/AntiSpamInstitute/spam-detector-bert-MoE-v2.2)

---

## モデル比較表

| モデル | サイズ | 速度 | 精度 | 統合難易度 | 推奨用途 |
|--------|--------|------|------|------------|----------|
| **lewispons/Email-classifier-v2** | 小 | 高速 | 高 | 易 | **メール分類（推奨）** |
| neelblabla/llama2-7b-peft | 大 | 中速 | 最高 | 中 | 高度な分類 |
| keshavkmr076/email-classification | 中 | 高速 | 高 | 易 | 汎用メール分類 |
| AntiSpamInstitute/spam-detector | 中 | 高速 | 98%+ | 易 | スパム検出専用 |

---

## MailDeckへの統合方法

### アプローチA: Python マイクロサービス【推奨】

ASP.NET CoreバックエンドとPythonマイクロサービスを連携させる方法。

#### アーキテクチャ

```
ASP.NET Core API (C#)
    ↓ HTTP/gRPC
Python Microservice (FastAPI/Flask)
    ↓
Hugging Face Transformers
    ↓
学習済みモデル (lewispons/Email-classifier-v2)
```

#### メリット
- ✅ Pythonエコシステム（Hugging Face）をそのまま活用
- ✅ モデルの切り替えが容易
- ✅ 既存のASP.NET Coreコードに影響なし

#### 実装例

**1. Python マイクロサービス (FastAPI)**

```python
# requirements.txt
fastapi==0.104.1
uvicorn==0.24.0
setfit==1.0.0
transformers==4.35.0

# main.py
from fastapi import FastAPI
from setfit import SetFitModel
from pydantic import BaseModel

app = FastAPI()

# モデルの読み込み（起動時に1回）
model = SetFitModel.from_pretrained("lewispons/Email-classifier-v2")

class EmailData(BaseModel):
    from_addr: str
    subject: str
    body: str

@app.post("/classify")
async def classify_email(email: EmailData):
    # メール全体を1つのテキストに結合
    text = f"From: {email.from_addr}\nSubject: {email.subject}\n\n{email.body}"

    # 予測
    predictions = model.predict([text])
    probabilities = model.predict_proba([text])

    # 結果を返す
    return {
        "label": predictions[0],
        "confidence": float(max(probabilities[0])),
        "all_scores": {
            label: float(score)
            for label, score in zip(model.labels, probabilities[0])
        }
    }

@app.get("/health")
async def health():
    return {"status": "ok"}

# 起動: uvicorn main:app --host 0.0.0.0 --port 8001
```

**2. ASP.NET Core から呼び出し**

```csharp
// Services/EmailClassificationService.cs
public class EmailClassificationService
{
    private readonly HttpClient _httpClient;
    private readonly string _pythonServiceUrl;

    public EmailClassificationService(IConfiguration config)
    {
        _httpClient = new HttpClient();
        _pythonServiceUrl = config["PythonService:Url"] ?? "http://localhost:8001";
    }

    public async Task<EmailClassification?> ClassifyEmailAsync(MimeMessage message)
    {
        var request = new
        {
            from_addr = message.From.ToString(),
            subject = message.Subject ?? "",
            body = message.TextBody ?? message.HtmlBody ?? ""
        };

        var response = await _httpClient.PostAsJsonAsync(
            $"{_pythonServiceUrl}/classify",
            request
        );

        if (!response.IsSuccessStatusCode)
            return null;

        return await response.Content.ReadFromJsonAsync<EmailClassification>();
    }
}

public class EmailClassification
{
    public string Label { get; set; } = string.Empty;
    public double Confidence { get; set; }
    public Dictionary<string, double> AllScores { get; set; } = new();
}
```

**3. EmailCheckBackgroundService に統合**

```csharp
// EmailCheckBackgroundService.cs
var classificationService = serviceScope.ServiceProvider
    .GetRequiredService<EmailClassificationService>();

foreach (var newMessage in newMessages)
{
    // AI分類
    var classification = await classificationService.ClassifyEmailAsync(newMessage.Message);

    if (classification != null && classification.Confidence >= 0.7)
    {
        // 信頼度70%以上なら自動ラベル付与
        var label = await FindOrCreateLabelAsync(config.UserId, classification.Label);

        await db.InsertAsync(new MailLabel
        {
            Id = Guid.NewGuid(),
            UserId = config.UserId,
            MessageId = newMessage.Message.MessageId,
            LabelId = label.Id,
            ServerConfigId = config.Id,
            CreatedAt = DateTime.UtcNow
        });
    }
}
```

#### デプロイメント

```bash
# Pythonサービスをsystemdで管理
# /etc/systemd/system/maildeck-ml.service
[Unit]
Description=MailDeck ML Service
After=network.target

[Service]
Type=simple
User=maildeck
WorkingDirectory=/opt/maildeck-ml
ExecStart=/opt/maildeck-ml/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8001
Restart=always

[Install]
WantedBy=multi-user.target
```

---

### アプローチB: ONNX Runtime (.NET統合)

Python依存なしで、C#から直接モデルを実行する方法。

#### 手順

1. **Pythonでモデルをエクスポート**

```python
from setfit import SetFitModel
import onnx

model = SetFitModel.from_pretrained("lewispons/Email-classifier-v2")
model.model_body.save_pretrained("./email_classifier_onnx", export_onnx=True)
```

2. **C#でONNX Runtimeを使用**

```csharp
// NuGet: Microsoft.ML.OnnxRuntime
using Microsoft.ML.OnnxRuntime;

public class OnnxEmailClassifier
{
    private readonly InferenceSession _session;

    public OnnxEmailClassifier(string modelPath)
    {
        _session = new InferenceSession(modelPath);
    }

    public async Task<string> ClassifyAsync(string text)
    {
        // Tokenization + Inference
        // 注意: Tokenizerの実装が必要（複雑）
        // ...
    }
}
```

#### デメリット
- ❌ Tokenizerの実装が複雑
- ❌ モデル変換に手間がかかる
- ❌ Hugging Faceエコシステムの利便性を失う

---

### アプローチC: 外部APIサービス

Hugging Face Inference APIを直接呼び出す方法。

```csharp
public class HuggingFaceInferenceService
{
    private readonly HttpClient _httpClient;
    private readonly string _apiKey;

    public async Task<string> ClassifyEmailAsync(string text)
    {
        var request = new
        {
            inputs = text
        };

        var httpRequest = new HttpRequestMessage(HttpMethod.Post,
            "https://api-inference.huggingface.co/models/lewispons/Email-classifier-v2")
        {
            Content = JsonContent.Create(request)
        };
        httpRequest.Headers.Add("Authorization", $"Bearer {_apiKey}");

        var response = await _httpClient.SendAsync(httpRequest);
        // ...
    }
}
```

#### デメリット
- ❌ 外部依存（レイテンシ、コスト）
- ❌ プライバシー懸念（メール内容を外部送信）
- ✅ インフラ管理不要

---

## ゼロショット分類（LLM）

### Claude / GPT / Llama を使った分類

学習済みモデル不要で、プロンプトのみで分類可能。

```csharp
public async Task<List<string>> ClassifyWithLLMAsync(
    MimeMessage message,
    List<Label> userLabels)
{
    var prompt = $@"
以下のメールを分析し、適切なラベルを選択してください。

利用可能なラベル:
{string.Join("\n", userLabels.Select(l => $"- {l.Name}"))}

メール:
送信者: {message.From}
件名: {message.Subject}
本文: {message.TextBody?.Substring(0, 500)}

JSON形式で、適用すべきラベル名の配列を返してください。
{{"labels": ["ラベル1", "ラベル2"]}}
";

    // Claude API / OpenAI API / Ollama Local LLM呼び出し
    var response = await _aiClient.CompleteAsync(prompt);
    return ParseLabels(response);
}
```

#### Ollama統合（ローカルLLM - プライバシー保護）

```bash
# Ollamaインストール（自宅サーバー）
curl -fsSL https://ollama.com/install.sh | sh

# 軽量モデルダウンロード
ollama pull llama3.2:3b
```

```csharp
// ローカルOllama API呼び出し
var response = await _httpClient.PostAsJsonAsync(
    "http://localhost:11434/api/generate",
    new
    {
        model = "llama3.2:3b",
        prompt = prompt,
        stream = false
    }
);
```

---

## 推奨実装戦略

### 🎯 Phase 1: Pythonマイクロサービス + SetFit

**理由**:
- ✅ 最も実装が容易
- ✅ 高精度（lewispons/Email-classifier-v2）
- ✅ ローカル実行（プライバシー保護）
- ✅ 低コスト（自宅サーバー内で完結）
- ✅ 既存のC#コードに影響なし

**リソース要件**:
- メモリ: 2-4GB
- CPU: 推論1件あたり100-500ms
- ディスク: 500MB程度

### 🎯 Phase 2: ユーザーカスタムラベル対応

**方法**:
1. ユーザーがラベルの説明文を記述
2. Few-shot learningで既存モデルを適応
3. またはOllama Local LLMでゼロショット分類

---

## まとめ

### 利用可能な学習済みモデル
- ✅ **Hugging Faceに複数の学習済みモデルが存在**
- ✅ **lewispons/Email-classifier-v2が最適**（軽量、高速、高精度）
- ✅ **スパム検出専用モデルも利用可能**

### 統合方法
- 🏆 **推奨: Pythonマイクロサービス（FastAPI + SetFit）**
- ⚠️ ONNX Runtime: 複雑で非推奨
- ⚠️ 外部API: プライバシー懸念

### 次のステップ
1. Pythonマイクロサービスのプロトタイプ作成
2. ASP.NET Coreとの連携確認
3. EmailCheckBackgroundServiceに統合
4. ユーザーフィードバック機能追加

---

## Sources

- [Building an Email Classification Model with HuggingFace](https://balkaranbrar.medium.com/building-an-email-classification-model-with-huggingface-5e5e7f8f93b7)
- [lewispons/Email-classifier-v2](https://huggingface.co/lewispons/Email-classifier-v2)
- [neelblabla/email-classification-llama2-7b-peft](https://huggingface.co/neelblabla/email-classification-llama2-7b-peft)
- [AntiSpamInstitute/spam-detector-bert-MoE-v2.2](https://huggingface.co/AntiSpamInstitute/spam-detector-bert-MoE-v2.2)
- [Bert-Mail-Classification GitHub](https://github.com/Nargesmohammadi/Bert-Mail-Classification)
- [Email Spam Detection using Pre-Trained BERT Model](https://blog.madhukaraphatak.com/bert-email-spam-1)
- [Zero-Shot Spam Email Classification Using Pre-trained LLMs](https://arxiv.org/html/2405.15936v1)
