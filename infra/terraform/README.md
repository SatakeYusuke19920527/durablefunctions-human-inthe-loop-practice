# infra/terraform — Azure インフラ（Terraform）

このリポジトリの全コンポーネントを Azure にデプロイするための Terraform 定義です。

## 管理するリソース

| リソース | 用途 |
|----------|------|
| Resource Group（`rg-openai-maf`） | 一式をまとめる（既存を import 可能） |
| Azure OpenAI（`oai-maf-26444` + `gpt-5-mini`） | Agent Framework の LLM（既存を import 可能） |
| Storage Account ×2 | 各 Function App の状態管理（Durable 用） |
| Function App（Node 20, Consumption） | `server/durablefunctions`（Durable Functions） |
| Function App（Python 3.11, Consumption） | `server/microsoftagentframework`（Agent Framework） |
| Log Analytics + Application Insights | 監視・ロギング |
| Container Registry（ACR） | `app/web` のコンテナイメージ格納 |
| Container Apps Environment + Container App | `app/web`（Next.js）を Container Apps でホスト |

### 構成図（デプロイ後）

```
┌── Container App: web (Next.js) ──┐   env: FUNCTIONS_BASE_URL / AGENT_BASE_URL
│   https://<web>.azurecontainerapps.io │
└──────────────┬───────────────────┘
     ┌─────────┴──────────┐
     ▼                    ▼
Function App (Node)   Function App (Python)
Durable Functions     Agent Framework ──▶ Azure OpenAI (gpt-5-mini)
:/api/*               :/api/*
```

---

## 前提

- Terraform >= 1.6
- Azure CLI でログイン済み（`az login`）＆対象サブスクリプションを選択
  （`az account set --subscription 356a75c5-1210-4544-ae5b-62ac93d8bdc9`）
- `Microsoft.CognitiveServices` / `Microsoft.App` / `Microsoft.Web` プロバイダ登録済み

---

## 使い方

### 1. 変数を用意

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
# 必要に応じて subscription_id / location / prefix などを編集
```

### 2. 既存リソースを import（RG と Azure OpenAI を管理下に置く）

すでに作成済みの `rg-openai-maf` と Azure OpenAI を Terraform 管理下に置きます。
（import しないと apply 時に「既に存在する」エラーになります）

```bash
terraform init

SUB=356a75c5-1210-4544-ae5b-62ac93d8bdc9
RG=rg-openai-maf
ACCT=oai-maf-26444

# リソースグループ
terraform import azurerm_resource_group.rg \
  "/subscriptions/$SUB/resourceGroups/$RG"

# Azure OpenAI アカウント
terraform import azurerm_cognitive_account.openai \
  "/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.CognitiveServices/accounts/$ACCT"

# gpt-5-mini デプロイ
terraform import azurerm_cognitive_deployment.chat \
  "/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.CognitiveServices/accounts/$ACCT/deployments/gpt-5-mini"
```

> ゼロから作る場合（既存リソースが無い場合）は import 不要で、そのまま `apply` すれば作成されます。
> その場合 `openai_account_name` はグローバル一意な新しい名前にしてください。

### 3. plan / apply

```bash
terraform plan
terraform apply
```

Function App / Container Apps / ACR / Storage などが作成されます。
初回は Web は公開プレースホルダイメージで起動します（次の手順で本物に差し替え）。

### 4. アプリのコードをデプロイ

Terraform は「箱」を作ります。アプリ本体は以下でデプロイします。

**Durable Functions（Node）**
```bash
cd ../../server/durablefunctions
npm install && npm run build
func azure functionapp publish $(terraform -chdir=../../infra/terraform output -raw durablefunctions_name)
```

**Agent Framework（Python）**
```bash
cd ../../server/microsoftagentframework
func azure functionapp publish $(terraform -chdir=../../infra/terraform output -raw agentframework_name) --python
```

**Web（Next.js → Container Apps）**
```bash
cd ../../app/web
ACR=$(terraform -chdir=../../infra/terraform output -raw acr_name)

# ACR でイメージをビルド（ローカル Docker 不要）
az acr build --registry $ACR --image web:latest .

# Container App のイメージを差し替え
LOGIN=$(terraform -chdir=../../infra/terraform output -raw acr_login_server)
# 方法A: 変数で指定して再 apply（推奨・状態が一致）
terraform -chdir=../../infra/terraform apply -var "web_image=$LOGIN/web:latest"
# 方法B: az で直接更新（terraform state とはズレる）
# az containerapp update -n <web-app> -g rg-openai-maf --image $LOGIN/web:latest
```

### 5. 動作確認

```bash
terraform output web_url          # ブラウザで開く
terraform output durablefunctions_url
terraform output agentframework_url
```

---

## 設計メモ・注意

- **シークレット**: Azure OpenAI のキーは Terraform が Function App の App Settings に注入します。
  state ファイルに機密が含まれるため、**リモートバックエンド（暗号化 + アクセス制御）** を推奨
  （`providers.tf` のコメント参照）。`terraform.tfvars` と `*.tfstate` は Git 管理外です。
- **認証の改善余地**: 本番では OpenAI/ACR をキーではなく **Managed Identity** で参照するのが望ましい。
- **ホスティング SKU**: Function App は最小コストの Consumption（Y1）。高スループットが必要なら
  Flex Consumption / Elastic Premium に変更可能。
- **リージョン**: gpt-5-mini の割当がある `eastus2` を既定にしています。
- **CORS**: Function App は Web のホスト名を許可。フロントは基本 Next.js の API ルート経由で
  バックエンドを叩くため、直接 CORS に依存しません。

---

## デスクトップアプリ（app/desktop）について

Electron 製のデスクトップアプリは **クラウドにデプロイするものではなく、配布物（インストーラ）を配る**
形になります。詳細はリポジトリルートの会話 / `app/desktop/README.md` を参照してください。
概要:

- `app/desktop` は `app/web`（Container Apps 上の Web）を表示するシェルにできます。
  本番では Electron の読み込み先 URL を Container App の `web_url` に向ける構成が簡単です。
- 配布は `electron-builder` で各 OS 向けインストーラ（`.dmg` / `.exe` / `.AppImage`）を生成し、
  GitHub Releases などで配布します（`npm run dist`）。
- 自動更新が必要なら `electron-updater` + 配布先（GitHub Releases / 独自サーバー / Azure Blob Storage）
  を利用します。
