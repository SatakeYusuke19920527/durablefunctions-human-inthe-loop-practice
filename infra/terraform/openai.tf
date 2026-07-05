# ---- Azure OpenAI（既存 oai-maf-26444 を import して管理）----

resource "azurerm_cognitive_account" "openai" {
  name                  = var.openai_account_name
  location              = azurerm_resource_group.rg.location
  resource_group_name   = azurerm_resource_group.rg.name
  kind                  = "OpenAI"
  sku_name              = "S0"
  custom_subdomain_name = var.openai_account_name
  tags                  = var.tags
}

# gpt-5-mini のモデルデプロイ
resource "azurerm_cognitive_deployment" "chat" {
  name                 = var.openai_deployment_name
  cognitive_account_id = azurerm_cognitive_account.openai.id

  model {
    format  = "OpenAI"
    name    = var.openai_model_name
    version = var.openai_model_version
  }

  sku {
    name     = var.openai_sku_name
    capacity = var.openai_capacity
  }
}
