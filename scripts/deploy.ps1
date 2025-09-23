# =================================================================
# SCRIPT DE DEPLOY DOCKER SIMPLIFICADO - SISTEMA CNC
# =================================================================

# Configurar codificação UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# Cores para output
$ColorSuccess = "Green"
$ColorError = "Red"
$ColorWarning = "Yellow"
$ColorInfo = "Cyan"

function Write-Success($message) {
    Write-Host "✅ $message" -ForegroundColor $ColorSuccess
}

function Write-Error($message) {
    Write-Host "❌ $message" -ForegroundColor $ColorError
}

function Write-Warning($message) {
    Write-Host "⚠️  $message" -ForegroundColor $ColorWarning
}

function Write-Info($message) {
    Write-Host "ℹ️  $message" -ForegroundColor $ColorInfo
}

# Header
Clear-Host
Write-Host "=================================" -ForegroundColor $ColorInfo
Write-Host "SISTEMA CNC - DEPLOY SIMPLIFICADO" -ForegroundColor $ColorInfo
Write-Host "=================================" -ForegroundColor $ColorInfo

# Verificar Docker
try {
    $null = docker --version
    Write-Success "Docker encontrado"
}
catch {
    Write-Error "Docker não está instalado!"
    Read-Host "Pressione Enter para sair..."
    exit 1
}

# Verificar .env
if (-not (Test-Path ".env")) {
    Write-Error "Arquivo .env não encontrado!"
    Read-Host "Pressione Enter para sair..."
    exit 1
}
Write-Success "Arquivo .env encontrado"

# Verificar Playwright
try {
    if (Test-Path "${env:USERPROFILE}/AppData/Local/ms-playwright") {
        Write-Success "Browsers Playwright encontrados"
    } else {
        Write-Warning "Browsers Playwright não encontrados!"
        Write-Host "Execute: npx playwright install" -ForegroundColor Yellow
        Read-Host "Pressione Enter para continuar mesmo assim..."
    }
}
catch {
    Write-Warning "Não foi possível verificar Playwright"
}

# Build da imagem
Write-Host ""
Write-Info "📦 Building imagem Docker..."
docker build -t cnc-app .

if ($LASTEXITCODE -ne 0) {
    Write-Error "Erro no build da imagem!"
    Read-Host "Pressione Enter para sair..."
    exit 1
}
Write-Success "Imagem criada com sucesso"

# Parar container anterior se existir
Write-Info "🛑 Parando container anterior..."
docker stop cnc-sistema 2>$null
docker rm cnc-sistema 2>$null

# Criar diretórios se não existirem
if (-not (Test-Path "logs")) { New-Item -ItemType Directory -Path "logs" -Force | Out-Null }
if (-not (Test-Path "temp")) { New-Item -ItemType Directory -Path "temp" -Force | Out-Null }

# Executar novo container
Write-Info "🚀 Iniciando novo container..."
docker run -d `
  --name cnc-sistema `
  --env-file .env `
  --restart unless-stopped `
  -v "${PWD}/logs:/app/logs" `
  -v "${PWD}/temp:/app/temp" `
  -v "${env:USERPROFILE}/AppData/Local/ms-playwright:/ms-playwright:ro" `
  cnc-app

if ($LASTEXITCODE -ne 0) {
    Write-Error "Erro ao iniciar container!"
    Read-Host "Pressione Enter para sair..."
    exit 1
}

Write-Success "Container iniciado com sucesso!"

# Status
Write-Host ""
Write-Info "📊 Status do container:"
docker ps -f name=cnc-sistema

Write-Host ""
Write-Success "✅ Deploy concluído!"
Write-Host ""
Write-Host "📋 Comandos úteis:" -ForegroundColor $ColorInfo
Write-Host "   Ver logs:      docker logs cnc-sistema -f" -ForegroundColor White
Write-Host "   Parar:         docker stop cnc-sistema" -ForegroundColor White
Write-Host "   Reiniciar:     docker restart cnc-sistema" -ForegroundColor White
Write-Host "   Status:        docker ps -f name=cnc-sistema" -ForegroundColor White

Read-Host "`nPressione Enter para sair..."