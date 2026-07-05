variable "subscription_id" {
  description = "デプロイ先の Azure サブスクリプション ID"
  type        = string
  default     = "356a75c5-1210-4544-ae5b-62ac93d8bdc9"
}

variable "location" {
  description = "リソースのリージョン（RG/OpenAI/Storage/監視/ACR）"
  type        = string
  default     = "eastus2"
}

variable "compute_location" {
  description = "コンピュートのリージョン（Function App / Container Apps）。eastus2 は当サブスクで App Service 割当が 0 のため別リージョンを使用。"
  type        = string
  default     = "eastus"
}

variable "resource_group_name" {
  description = "リソースグループ名（既存の rg-openai-maf を管理下に置く場合はそのまま）"
  type        = string
  default     = "rg-openai-maf"
}

variable "prefix" {
  description = "新規リソース名のプレフィックス（3-8文字の英小文字を推奨）"
  type        = string
  default     = "maf"
}

# ---- Azure OpenAI（既存リソースを import して管理）----
variable "openai_account_name" {
  description = "Azure OpenAI アカウント名（既存: oai-maf-26444）"
  type        = string
  default     = "oai-maf-26444"
}

variable "openai_deployment_name" {
  description = "チャットモデルのデプロイ名"
  type        = string
  default     = "gpt-5-mini"
}

variable "openai_model_name" {
  description = "モデル名"
  type        = string
  default     = "gpt-5-mini"
}

variable "openai_model_version" {
  description = "モデルバージョン"
  type        = string
  default     = "2025-08-07"
}

variable "openai_sku_name" {
  description = "デプロイの SKU"
  type        = string
  default     = "GlobalStandard"
}

variable "openai_capacity" {
  description = "デプロイ容量（1000 TPM 単位）"
  type        = number
  default     = 50
}

variable "openai_api_version" {
  description = "Agent Framework が使う API バージョン（v1 サーフェスは preview）"
  type        = string
  default     = "preview"
}

# ---- Web (Container Apps) ----
variable "web_image" {
  description = "app/web のコンテナイメージ。初回は公開プレースホルダ、ビルド後は ACR のイメージを指定"
  type        = string
  default     = "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest"
}

variable "web_min_replicas" {
  description = "Web コンテナの最小レプリカ数"
  type        = number
  default     = 0
}

variable "web_max_replicas" {
  description = "Web コンテナの最大レプリカ数"
  type        = number
  default     = 2
}

variable "tags" {
  description = "全リソース共通タグ"
  type        = map(string)
  default = {
    project = "durablefunctions-maf"
    managed = "terraform"
  }
}
