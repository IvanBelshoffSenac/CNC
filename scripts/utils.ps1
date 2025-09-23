# ==param(
    [Parameter(Position=0)]
    [ValidateSet("logs", "stop", "start", "restart", "status", "force", "cleanup", "playwright", "host", "deploy", "help")]
    [string]$Action = "help"
)==========================================================
# UTILITÁRIOS DOCKER - SISTEMA CNC
# =================================================================

param(
    [Parameter(Position=0)]
    [ValidateSet("logs", "stop", "start", "restart", "status", "force", "cleanup", "help")]
    [string]$Action = "help"
)

# Cores
$ColorSuccess = "Green"
$ColorError = "Red"
$ColorWarning = "Yellow"
$ColorInfo = "Cyan"

function Write-Success($message) { Write-Host "✅ $message" -ForegroundColor $ColorSuccess }
function Write-Error($message) { Write-Host "❌ $message" -ForegroundColor $ColorError }
function Write-Warning($message) { Write-Host "⚠️  $message" -ForegroundColor $ColorWarning }
function Write-Info($message) { Write-Host "ℹ️  $message" -ForegroundColor $ColorInfo }

switch ($Action) {
    "logs" {
        Write-Info "📋 Mostrando logs do container CNC..."
        docker logs cnc-sistema -f
    }
    
    "stop" {
        Write-Info "⏹️ Parando container CNC..."
        docker stop cnc-sistema
        Write-Success "Container parado"
    }
    
    "start" {
        Write-Info "▶️ Iniciando container CNC..."
        docker start cnc-sistema
        Write-Success "Container iniciado"
    }
    
    "restart" {
        Write-Info "🔄 Reiniciando container CNC..."
        docker restart cnc-sistema
        Write-Success "Container reiniciado"
    }
    
    "status" {
        Write-Info "📊 Status do container CNC:"
        docker ps -f name=cnc-sistema
        Write-Host ""
        Write-Info "📈 Uso de recursos:"
        docker stats cnc-sistema --no-stream
    }
    
    "force" {
        Write-Info "⚡ Executando CNC força (one-shot)..."
        docker run --rm `
          --env-file .env.docker `
          --init `
          --ipc=host `
          --cap-add=SYS_ADMIN `
          -v "${PWD}/logs:/app/logs" `
          -v "${PWD}/temp:/app/temp" `
          cnc-app npm run force
        Write-Success "Execução força concluída"
    }
    
    "cleanup" {
        Write-Warning "🧹 Limpando containers e imagens antigas..."
        docker container prune -f
        docker image prune -f
        Write-Success "Limpeza concluída"
    }
    
    "deploy" {
        Write-Info "🚀 Executando deploy completo..."
        & "${PSScriptRoot}\deploy.ps1"
    }
    
    "help" {
        Write-Host ""
        Write-Host "🐳 UTILITÁRIOS DOCKER - SISTEMA CNC" -ForegroundColor $ColorInfo
        Write-Host "=====================================" -ForegroundColor $ColorInfo
        Write-Host ""
        Write-Host "Uso: .\utils.ps1 [ação]" -ForegroundColor White
        Write-Host ""
        Write-Host "Ações disponíveis:" -ForegroundColor $ColorInfo
        Write-Host "  logs      - Ver logs em tempo real" -ForegroundColor White
        Write-Host "  stop      - Parar container" -ForegroundColor White
        Write-Host "  start     - Iniciar container" -ForegroundColor White
        Write-Host "  restart   - Reiniciar container" -ForegroundColor White
        Write-Host "  status    - Mostrar status e recursos" -ForegroundColor White
        Write-Host "  force     - Executar coleta forçada (one-shot)" -ForegroundColor White
        Write-Host "  cleanup   - Limpar containers/imagens antigas" -ForegroundColor White
        Write-Host "  deploy    - Executar deploy completo" -ForegroundColor White
        Write-Host "  help      - Mostrar esta ajuda" -ForegroundColor White
        Write-Host ""
        Write-Host "Exemplos:" -ForegroundColor $ColorInfo
        Write-Host "  .\utils.ps1 logs" -ForegroundColor Gray
        Write-Host "  .\utils.ps1 restart" -ForegroundColor Gray
        Write-Host "  .\utils.ps1 force" -ForegroundColor Gray
        Write-Host "  .\utils.ps1 deploy" -ForegroundColor Gray
        Write-Host ""
    }
}