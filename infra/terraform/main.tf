# グローバル一意名を作るためのランダムサフィックス
resource "random_string" "suffix" {
  length  = 5
  upper   = false
  special = false
}

locals {
  suffix = random_string.suffix.result

  # 新規リソース名（グローバル一意が必要なものは suffix を付与）
  df_storage_name    = substr("${var.prefix}dfst${local.suffix}", 0, 24)
  agent_storage_name = substr("${var.prefix}agst${local.suffix}", 0, 24)
  df_func_name       = "${var.prefix}-df-func-${local.suffix}"
  agent_func_name    = "${var.prefix}-agent-func-${local.suffix}"
  acr_name           = substr("${var.prefix}acr${local.suffix}", 0, 50)
  law_name           = "${var.prefix}-law-${local.suffix}"
  appi_name          = "${var.prefix}-appi-${local.suffix}"
  cae_name           = "${var.prefix}-cae-${local.suffix}"
  web_app_name       = "${var.prefix}-web-${local.suffix}"
}

# 既存の rg-openai-maf を管理下に置く（未 import の場合は import が必要）
resource "azurerm_resource_group" "rg" {
  name     = var.resource_group_name
  location = var.location
  tags     = var.tags
}
