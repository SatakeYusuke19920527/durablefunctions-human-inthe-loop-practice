# infra/ — Terraform による Azure インフラ管理

このディレクトリで、本アプリを Azure にデプロイするためのインフラを **Terraform** で管理します。

> ⚠️ 実装はこれから。現時点ではディレクトリと方針のみ。

---

## デプロイ対象（このリポジトリの構成）

| コンポーネント | 内容 | デプロイ先（案） |
|----------------|------|------------------|
| `server/` | Azure Durable Functions（TypeScript v4） | **Azure Functions**（Flex Consumption / Node 20） |
| `app/web/` | Next.js フロントエンド | **Azure Static Web Apps** または **App Service** |
| （状態管理） | Durable Functions の履歴・キュー | **Azure Storage アカウント** |
| `app/desktop/` | Electron デスクトップ | デプロイ対象外（ローカル/配布） |

---

## 必要になる主な Azure リソース（想定）

- **Resource Group** — 一式をまとめる
- **Storage Account** — Durable Functions のタスクハブ（AzureWebJobsStorage）
- **Function App**（+ App Service Plan / Flex Consumption）— `server/` のホスト
- **Application Insights**（任意）— 監視・ロギング
- **Static Web App**（または App Service）— `app/web` のホスト
- **App Settings / 接続文字列** — `FUNCTIONS_BASE_URL` などの環境変数
  - フロントの API ルートが Functions を叩くための URL 連携

---

## 想定するディレクトリ構成（実装時）

```
infra/
├── README.md              # このファイル
├── main.tf                # プロバイダ・リソース定義のエントリ
├── variables.tf           # 入力変数（リージョン、命名、SKU など）
├── outputs.tf             # 出力（エンドポイントURL、リソース名など）
├── providers.tf           # azurerm プロバイダ設定・required_providers
├── backend.tf             # tfstate のリモートバックエンド（任意）
├── terraform.tfvars.example  # 変数のサンプル値
└── modules/               # 再利用モジュール（任意）
    ├── functions/
    ├── storage/
    └── frontend/
```

---

## 実装時の想定フロー

```bash
cd infra
terraform init      # プロバイダ・バックエンド初期化
terraform plan      # 変更内容の確認
terraform apply     # リソース作成

# アプリのデプロイ（Terraform 適用後）
cd ../server && func azure functionapp publish <function-app-name>
# フロントは SWA CLI / GitHub Actions などでデプロイ
```

---

## 検討事項（実装前のメモ）

- **tfstate の管理**: ローカル or リモート（Storage コンテナ + state lock）。チーム運用ならリモート推奨。
- **命名規約**: `rg-`, `st`, `func-` などプレフィックス + 環境サフィックス（dev/prod）。
- **フロントのホスト選定**: Next.js の API ルート（SSR/Route Handlers）を使うため、
  静的専用の Static Web Apps では制約が出る可能性 → **App Service（Node）** も候補。
  もしくは API ルートを Functions 側に寄せて SWA + Functions 構成にする。
- **シークレット**: 接続文字列は App Settings / Key Vault 参照で管理（tfvars に平文で置かない）。
- **認証**: 本番では Functions の `authLevel` を anonymous 以外にする / Easy Auth 検討。
- **CI/CD**: `terraform apply` と `func publish` を GitHub Actions で自動化する構成も視野。
