# =================================================================
# SCRIPT DE DEPLOYMENT POWERSHELL - SISTEMA CNC
# =================================================================
# Versão PowerShell com suporte completo a Unicode e emojis

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

function Test-Docker {
    try {
        $null = docker --version
        $null = docker-compose --version
        Write-Success "Docker e Docker Compose encontrados"
        return $true
    }
    catch {
        Write-Error "Docker ou Docker Compose não estão instalados!"
        return $false
    }
}

function Test-EnvFile {
    if (-not (Test-Path ".env")) {
        Write-Warning "Arquivo .env não encontrado!"
        Write-Host "Copiando .env.docker.example para .env..."
        Copy-Item ".env.docker.example" ".env"
        Write-Warning "IMPORTANTE: Edite o arquivo .env com suas configurações!"
        Read-Host "Pressione Enter para continuar..."
    }
    Write-Success "Arquivo .env encontrado"
}

function Initialize-Directories {
    if (-not (Test-Path "logs")) { New-Item -ItemType Directory -Path "logs" -Force | Out-Null }
    if (-not (Test-Path "temp")) { New-Item -ItemType Directory -Path "temp" -Force | Out-Null }
    Write-Success "Diretórios criados: logs/, temp/"
}

function Show-Menu {
    Clear-Host
    Write-Host "=================================" -ForegroundColor $ColorInfo
    Write-Host "SISTEMA CNC - GERENCIAMENTO DOCKER" -ForegroundColor $ColorInfo
    Write-Host "=================================" -ForegroundColor $ColorInfo
    Write-Host "1) 🚀 Deploy completo (build + start)"
    Write-Host "2) 🔨 Build aplicação"
    Write-Host "3) ▶️  Iniciar serviços"
    Write-Host "4) ⏹️  Parar serviços"
    Write-Host "5) 📋 Ver logs"
    Write-Host "6) 📊 Status dos serviços"
    Write-Host "7) 💾 Backup banco de dados"
    Write-Host "8) 🔄 Executar migrações"
    Write-Host "9) ⚡ Forçar execução CNC"
    Write-Host "0) 🚪 Sair"
    Write-Host ""
}

function Invoke-Deploy {
    Write-Host "=================================" -ForegroundColor $ColorInfo
    Write-Host "BUILDING + INICIANDO SERVIÇOS" -ForegroundColor $ColorInfo
    Write-Host "=================================" -ForegroundColor $ColorInfo
    
    docker-compose build --no-cache cnc-app
    docker-compose up -d
    
    Write-Success "Deploy concluído"
}

function Invoke-Build {
    Write-Host "=================================" -ForegroundColor $ColorInfo
    Write-Host "BUILDING APLICAÇÃO CNC" -ForegroundColor $ColorInfo
    Write-Host "=================================" -ForegroundColor $ColorInfo
    
    docker-compose build --no-cache cnc-app
    
    Write-Success "Build concluído"
}

function Start-Services {
    Write-Host "=================================" -ForegroundColor $ColorInfo
    Write-Host "INICIANDO SERVIÇOS" -ForegroundColor $ColorInfo
    Write-Host "=================================" -ForegroundColor $ColorInfo
    
    docker-compose up -d
    docker-compose ps
    
    Write-Success "Serviços iniciados"
}

function Stop-Services {
    Write-Host "=================================" -ForegroundColor $ColorInfo
    Write-Host "PARANDO SERVIÇOS" -ForegroundColor $ColorInfo
    Write-Host "=================================" -ForegroundColor $ColorInfo
    
    docker-compose down
    
    Write-Success "Serviços parados"
}

function Show-Logs {
    Write-Host "=================================" -ForegroundColor $ColorInfo
    Write-Host "LOGS DA APLICAÇÃO CNC" -ForegroundColor $ColorInfo
    Write-Host "=================================" -ForegroundColor $ColorInfo
    
    docker-compose logs -f cnc-app
}

function Show-Status {
    Write-Host "=================================" -ForegroundColor $ColorInfo
    Write-Host "STATUS DOS SERVIÇOS" -ForegroundColor $ColorInfo
    Write-Host "=================================" -ForegroundColor $ColorInfo
    
    docker-compose ps
    
    Write-Host ""
    Write-Host "=================================" -ForegroundColor $ColorInfo
    Write-Host "HEALTH CHECK" -ForegroundColor $ColorInfo
    Write-Host "=================================" -ForegroundColor $ColorInfo
    
    try {
        docker-compose exec cnc-app node -e "console.log('CNC System: OK')" 2>$null
        Write-Success "Aplicação CNC: Healthy"
    }
    catch {
        Write-Warning "Aplicação CNC: Não disponível"
    }
    
    try {
        docker-compose exec mysql mysqladmin ping -h localhost --silent 2>$null
        Write-Success "MySQL: Healthy"
    }
    catch {
        Write-Warning "MySQL: Não disponível"
    }
}

function Invoke-Backup {
    Write-Host "=================================" -ForegroundColor $ColorInfo
    Write-Host "BACKUP DO BANCO DE DADOS" -ForegroundColor $ColorInfo
    Write-Host "=================================" -ForegroundColor $ColorInfo
    
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $backupFile = "backup_cnc_$timestamp.sql"
    
    docker-compose exec -T mysql mysqldump -u root -p cnc > $backupFile
    
    Write-Success "Backup salvo em: $backupFile"
}

function Invoke-Migration {
    Write-Host "=================================" -ForegroundColor $ColorInfo
    Write-Host "EXECUTANDO MIGRAÇÕES" -ForegroundColor $ColorInfo
    Write-Host "=================================" -ForegroundColor $ColorInfo
    
    docker-compose exec cnc-app npm run migration:run
    
    Write-Success "Migrações executadas"
}

function Invoke-Force {
    Write-Host "=================================" -ForegroundColor $ColorInfo
    Write-Host "FORÇANDO EXECUÇÃO CNC" -ForegroundColor $ColorInfo
    Write-Host "=================================" -ForegroundColor $ColorInfo
    
    docker-compose exec cnc-app npm run force
    
    Write-Success "Execução forçada concluída"
}

# Script principal
function Main {
    # Verificar pré-requisitos
    if (-not (Test-Docker)) {
        Read-Host "Pressione Enter para sair..."
        exit 1
    }
    
    Test-EnvFile
    Initialize-Directories
    
    # Loop principal do menu
    do {
        Show-Menu
        $choice = Read-Host "Escolha uma opção"
        
        switch ($choice) {
            "1" { Invoke-Deploy }
            "2" { Invoke-Build }
            "3" { Start-Services }
            "4" { Stop-Services }
            "5" { Show-Logs }
            "6" { Show-Status }
            "7" { Invoke-Backup }
            "8" { Invoke-Migration }
            "9" { Invoke-Force }
            "0" { 
                Write-Success "Até logo!"
                exit 0 
            }
            default { 
                Write-Error "Opção inválida!"
            }
        }
        
        if ($choice -ne "5") {
            Write-Host ""
            Read-Host "Pressione Enter para continuar..."
        }
        
    } while ($true)
}

# Executar script principal
Main