# =================================================================
# SCRIPT DE DEPLOY DOCKER - IMAGEM OFICIAL PLAYWRIGHT
# =================================================================

param()

# Configurar codificacao UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# Cores
$ColorSuccess = "Green"
$ColorError = "Red"
$ColorWarning = "Yellow"
$ColorInfo = "Cyan"

function Write-Success($message) {
    Write-Host "[OK] $message" -ForegroundColor $ColorSuccess
}

function Write-Error($message) {
    Write-Host "[ERRO] $message" -ForegroundColor $ColorError
}

function Write-Warning($message) {
    Write-Host "[AVISO] $message" -ForegroundColor $ColorWarning
}

function Write-Info($message) {
    Write-Host "[INFO] $message" -ForegroundColor $ColorInfo
}

# Header
Clear-Host
Write-Host "DEPLOY DOCKER CNC - IMAGEM OFICIAL PLAYWRIGHT" -ForegroundColor $ColorInfo
Write-Host "==============================================" -ForegroundColor $ColorInfo

# Verificar Docker
try {
    docker --version | Out-Null
    Write-Success "Docker encontrado"
}
catch {
    Write-Error "Docker nao encontrado!"
    Write-Host "Instale o Docker Desktop: https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
    Read-Host "Pressione Enter para sair..."
    exit 1
}

# Verificar .env.docker
if (-not (Test-Path ".env.docker")) {
    Write-Error "Arquivo .env.docker nao encontrado!"
    
    if (Test-Path ".env.docker.example") {
        Write-Warning "Copiando .env.docker.example para .env.docker..."
        Copy-Item ".env.docker.example" ".env.docker"
        Write-Warning "IMPORTANTE: Edite o arquivo .env.docker com suas configuracoes especificas!"
        Write-Info "Configure: HOST, DB_USER, PASSWORD, CREDENTIALS_*, MAIL_* etc."
        Read-Host "Pressione Enter para continuar apos editar o .env.docker..."
    } elseif (Test-Path ".env") {
        Write-Warning "Copiando .env para .env.docker..."
        Copy-Item ".env" ".env.docker"
        Write-Warning "IMPORTANTE: Edite o .env.docker removendo aspas duplas dos valores!"
        Read-Host "Pressione Enter para continuar apos editar o .env.docker..."
    } else {
        Write-Error "Nenhum arquivo de configuracao encontrado!"
        Write-Warning "Crie um arquivo .env.docker com as configuracoes necessarias."
        Read-Host "Pressione Enter para sair..."
        exit 1
    }
}
Write-Success "Arquivo .env.docker encontrado"

# Verificar Playwright - Usando imagem oficial
Write-Info "Usando imagem oficial Playwright com browsers integrados"
Write-Success "Browsers ja incluidos na imagem Docker oficial"

# Build da imagem
Write-Host ""
Write-Info "Building imagem Docker oficial Playwright..."
docker build -t cnc-app .

if ($LASTEXITCODE -ne 0) {
    Write-Error "Erro no build da imagem!"
    Read-Host "Pressione Enter para sair..."
    exit 1
}
Write-Success "Imagem criada com sucesso"

# Parar container anterior se existir
Write-Info "Parando container anterior..."
docker stop cnc-sistema 2>$null
docker rm cnc-sistema 2>$null

# Criar diretorios se nao existirem
if (-not (Test-Path "logs")) { New-Item -ItemType Directory -Path "logs" -Force | Out-Null }
if (-not (Test-Path "temp")) { New-Item -ItemType Directory -Path "temp" -Force | Out-Null }

# Executar novo container com configuracoes oficiais Playwright
Write-Info "Iniciando novo container..."
docker run -d `
  --name cnc-sistema `
  --env-file .env.docker `
  --restart unless-stopped `
  --init `
  --ipc=host `
  --cap-add=SYS_ADMIN `
  -v "${PWD}/logs:/app/logs" `
  -v "${PWD}/temp:/app/temp" `
  cnc-app

if ($LASTEXITCODE -ne 0) {
    Write-Error "Erro ao iniciar container!"
    Read-Host "Pressione Enter para sair..."
    exit 1
}
Write-Success "Container iniciado com sucesso!"

# Status
Write-Host ""
Write-Info "Status do container:"
docker ps -f name=cnc-sistema

Write-Host ""
Write-Success "Deploy concluido!"

Write-Host ""
Write-Host "Comandos uteis:" -ForegroundColor $ColorInfo
Write-Host "   Ver logs:      docker logs cnc-sistema -f" -ForegroundColor White
Write-Host "   Parar:         docker stop cnc-sistema" -ForegroundColor White
Write-Host "   Reiniciar:     docker restart cnc-sistema" -ForegroundColor White
Write-Host "   Status:        docker ps -f name=cnc-sistema" -ForegroundColor White
Write-Host "   Teste:         docker exec -it cnc-sistema node build/force.js" -ForegroundColor White

Read-Host "Pressione Enter para sair..."