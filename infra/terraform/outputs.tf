output "resource_group" {
  description = "リソースグループ名"
  value       = azurerm_resource_group.rg.name
}

output "openai_endpoint" {
  description = "Azure OpenAI エンドポイント"
  value       = azurerm_cognitive_account.openai.endpoint
}

output "openai_deployment" {
  description = "チャットモデルのデプロイ名"
  value       = azurerm_cognitive_deployment.chat.name
}

output "durablefunctions_name" {
  description = "Durable Functions（Node）の Function App 名"
  value       = azurerm_function_app_flex_consumption.df.name
}

output "durablefunctions_url" {
  description = "Durable Functions のベース URL"
  value       = "https://${azurerm_function_app_flex_consumption.df.default_hostname}"
}

output "agentframework_name" {
  description = "Agent Framework（Python）の Function App 名"
  value       = azurerm_function_app_flex_consumption.agent.name
}

output "agentframework_url" {
  description = "Agent Framework のベース URL"
  value       = "https://${azurerm_function_app_flex_consumption.agent.default_hostname}"
}

output "acr_login_server" {
  description = "Container Registry のログインサーバー"
  value       = azurerm_container_registry.acr.login_server
}

output "acr_name" {
  description = "Container Registry 名"
  value       = azurerm_container_registry.acr.name
}

output "web_url" {
  description = "Web（Container App）の公開 URL"
  value       = "https://${azurerm_container_app.web.ingress[0].fqdn}"
}
