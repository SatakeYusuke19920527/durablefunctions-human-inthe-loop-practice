# app/web（Next.js standalone）を Azure Container Apps にデプロイする。
# イメージは ACR に置く（初回は公開プレースホルダで作成 → ビルド後に var.web_image を差し替え）。

resource "azurerm_container_registry" "acr" {
  name                = local.acr_name
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  sku                 = "Basic"
  admin_enabled       = true # 簡便化のため admin 認証を有効（本番は Managed Identity 推奨）
  tags                = var.tags
}

resource "azurerm_container_app_environment" "cae" {
  name                       = local.cae_name
  resource_group_name        = azurerm_resource_group.rg.name
  location                   = var.compute_location
  log_analytics_workspace_id = azurerm_log_analytics_workspace.law.id
  tags                       = var.tags
}

resource "azurerm_container_app" "web" {
  name                         = local.web_app_name
  resource_group_name          = azurerm_resource_group.rg.name
  container_app_environment_id = azurerm_container_app_environment.cae.id
  revision_mode                = "Single"
  tags                         = var.tags

  # ACR からイメージを取得するための認証（admin 資格情報）
  registry {
    server               = azurerm_container_registry.acr.login_server
    username             = azurerm_container_registry.acr.admin_username
    password_secret_name = "acr-password"
  }

  secret {
    name  = "acr-password"
    value = azurerm_container_registry.acr.admin_password
  }

  ingress {
    external_enabled = true
    target_port      = 3000
    transport        = "auto"

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = var.web_min_replicas
    max_replicas = var.web_max_replicas

    container {
      name   = "web"
      image  = var.web_image
      cpu    = 0.5
      memory = "1Gi"

      # Next.js standalone は PORT/HOSTNAME を尊重する
      env {
        name  = "PORT"
        value = "3000"
      }
      env {
        name  = "HOSTNAME"
        value = "0.0.0.0"
      }
      # フロントの API ルートが叩くバックエンド URL
      env {
        name  = "FUNCTIONS_BASE_URL"
        value = "https://${azurerm_function_app_flex_consumption.df.default_hostname}"
      }
      env {
        name  = "AGENT_BASE_URL"
        value = "https://${azurerm_function_app_flex_consumption.agent.default_hostname}"
      }
    }
  }

  lifecycle {
    # イメージはデプロイ（CI / az containerapp update）で更新するため差分を無視する場合はコメント解除
    # ignore_changes = [template[0].container[0].image]
  }
}
