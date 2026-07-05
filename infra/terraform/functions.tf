# 2つの Function App（Flex Consumption）:
#  - Durable Functions（Node 20）: server/durablefunctions
#  - Agent Framework（Python 3.11）: server/microsoftagentframework
#
# ※ このサブスクリプションは従来の Consumption(Y1) の App Service 割当が 0 のため、
#   割当モデルが異なる Flex Consumption を使用する（eastus2 で作成可能）。

# ---- デプロイ用の Blob コンテナ（Flex Consumption が必要とする）----
resource "azurerm_storage_container" "df_deploy" {
  name                  = "deployments"
  storage_account_name  = azurerm_storage_account.df.name
  container_access_type = "private"
}

resource "azurerm_storage_container" "agent_deploy" {
  name                  = "deployments"
  storage_account_name  = azurerm_storage_account.agent.name
  container_access_type = "private"
}

# ---- Durable Functions（Node）----
resource "azurerm_service_plan" "df" {
  name                = "${var.prefix}-df-plan-${local.suffix}"
  resource_group_name = azurerm_resource_group.rg.name
  location            = var.location
  os_type             = "Linux"
  sku_name            = "FC1" # Flex Consumption
  tags                = var.tags
}

resource "azurerm_function_app_flex_consumption" "df" {
  name                = local.df_func_name
  resource_group_name = azurerm_resource_group.rg.name
  location            = var.location
  service_plan_id     = azurerm_service_plan.df.id

  storage_container_type      = "blobContainer"
  storage_container_endpoint  = "${azurerm_storage_account.df.primary_blob_endpoint}${azurerm_storage_container.df_deploy.name}"
  storage_authentication_type = "StorageAccountConnectionString"
  storage_access_key          = azurerm_storage_account.df.primary_access_key

  runtime_name    = "node"
  runtime_version = "20"

  maximum_instance_count = 40
  instance_memory_in_mb  = 2048

  https_only = true
  tags       = var.tags

  site_config {
    application_insights_connection_string = azurerm_application_insights.appi.connection_string
    application_insights_key               = azurerm_application_insights.appi.instrumentation_key
  }

  app_settings = {
    # v4 プログラミングモデル（TypeScript）に必要
    AzureWebJobsFeatureFlags = "EnableWorkerIndexing"
  }
}

# ---- Agent Framework（Python）----
resource "azurerm_service_plan" "agent" {
  name                = "${var.prefix}-agent-plan-${local.suffix}"
  resource_group_name = azurerm_resource_group.rg.name
  location            = var.location
  os_type             = "Linux"
  sku_name            = "FC1"
  tags                = var.tags
}

resource "azurerm_function_app_flex_consumption" "agent" {
  name                = local.agent_func_name
  resource_group_name = azurerm_resource_group.rg.name
  location            = var.location
  service_plan_id     = azurerm_service_plan.agent.id

  storage_container_type      = "blobContainer"
  storage_container_endpoint  = "${azurerm_storage_account.agent.primary_blob_endpoint}${azurerm_storage_container.agent_deploy.name}"
  storage_authentication_type = "StorageAccountConnectionString"
  storage_access_key          = azurerm_storage_account.agent.primary_access_key

  runtime_name    = "python"
  runtime_version = "3.11"

  maximum_instance_count = 40
  instance_memory_in_mb  = 2048

  https_only = true
  tags       = var.tags

  site_config {
    application_insights_connection_string = azurerm_application_insights.appi.connection_string
    application_insights_key               = azurerm_application_insights.appi.instrumentation_key
  }

  app_settings = {
    AzureWebJobsFeatureFlags = "EnableWorkerIndexing"

    # Agent Framework（gpt-5-mini）接続情報
    AZURE_OPENAI_ENDPOINT             = azurerm_cognitive_account.openai.endpoint
    AZURE_OPENAI_CHAT_DEPLOYMENT_NAME = azurerm_cognitive_deployment.chat.name
    AZURE_OPENAI_API_KEY              = azurerm_cognitive_account.openai.primary_access_key
    AZURE_OPENAI_API_VERSION          = var.openai_api_version
  }
}
