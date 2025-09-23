@echo off
REM =================================================================
REM SCRIPT DE DEPLOYMENT WINDOWS - SISTEMA CNC
REM =================================================================
REM Facilita o deployment e gerenciamento do sistema via Docker no Windows

setlocal enabledelayedexpansion

REM Verificar se Docker está instalado
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker não está instalado!
    pause
    exit /b 1
)

docker-compose --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker Compose não está instalado!
    pause
    exit /b 1
)

echo ✅ Docker e Docker Compose encontrados

REM Verificar arquivo .env
if not exist ".env" (
    echo ⚠️  Arquivo .env não encontrado!
    echo Copiando .env.docker.example para .env...
    copy .env.docker.example .env
    echo IMPORTANTE: Edite o arquivo .env com suas configurações!
    pause
)
echo ✅ Arquivo .env encontrado

REM Criar diretórios necessários
if not exist "logs" mkdir logs
if not exist "temp" mkdir temp
echo ✅ Diretórios criados: logs/, temp/

REM Menu principal
:menu
echo.
echo =================================
echo SISTEMA CNC - GERENCIAMENTO DOCKER
echo =================================
echo 1) 🚀 Deploy completo (build + start)
echo 2) 🔨 Build aplicação
echo 3) ▶️  Iniciar serviços
echo 4) ⏹️  Parar serviços
echo 5) 📋 Ver logs
echo 6) 📊 Status dos serviços
echo 7) 💾 Backup banco de dados
echo 8) 🔄 Executar migrações
echo 9) ⚡ Forçar execução CNC
echo 0) 🚪 Sair
echo.
set /p choice="Escolha uma opção: "

if "%choice%"=="1" goto deploy
if "%choice%"=="2" goto build
if "%choice%"=="3" goto start
if "%choice%"=="4" goto stop
if "%choice%"=="5" goto logs
if "%choice%"=="6" goto status
if "%choice%"=="7" goto backup
if "%choice%"=="8" goto migrate
if "%choice%"=="9" goto force
if "%choice%"=="0" goto exit
echo ❌ Opção inválida!
goto menu

:deploy
echo =================================
echo BUILDING + INICIANDO SERVIÇOS
echo =================================
docker-compose build --no-cache cnc-app
docker-compose up -d
echo ✅ Deploy concluído
goto menu

:build
echo =================================
echo BUILDING APLICAÇÃO CNC
echo =================================
docker-compose build --no-cache cnc-app
echo ✅ Build concluído
goto menu

:start
echo =================================
echo INICIANDO SERVIÇOS
echo =================================
docker-compose up -d
echo ✅ Serviços iniciados
docker-compose ps
goto menu

:stop
echo =================================
echo PARANDO SERVIÇOS
echo =================================
docker-compose down
echo ✅ Serviços parados
goto menu

:logs
echo =================================
echo LOGS DA APLICAÇÃO CNC
echo =================================
docker-compose logs -f cnc-app
goto menu

:status
echo =================================
echo STATUS DOS SERVIÇOS
echo =================================
docker-compose ps
echo.
echo =================================
echo HEALTH CHECK
echo =================================
docker-compose exec cnc-app node -e "console.log('CNC System: OK')" 2>nul && echo ✅ Aplicação CNC: Healthy || echo ⚠️  Aplicação CNC: Não disponível
docker-compose exec mysql mysqladmin ping -h localhost --silent 2>nul && echo ✅ MySQL: Healthy || echo ⚠️  MySQL: Não disponível
goto menu

:backup
echo =================================
echo BACKUP DO BANCO DE DADOS
echo =================================
for /f "tokens=2 delims==" %%I in ('wmic OS Get localdatetime /value') do set "dt=%%I"
set "YYYY=%dt:~0,4%"
set "MM=%dt:~4,2%"
set "DD=%dt:~6,2%"
set "HH=%dt:~8,2%"
set "Min=%dt:~10,2%"
set "Sec=%dt:~12,2%"
set "BACKUP_FILE=backup_cnc_%YYYY%%MM%%DD%_%HH%%Min%%Sec%.sql"
docker-compose exec -T mysql mysqldump -u root -p cnc > "%BACKUP_FILE%"
echo ✅ Backup salvo em: %BACKUP_FILE%
goto menu

:migrate
echo =================================
echo EXECUTANDO MIGRAÇÕES
echo =================================
docker-compose exec cnc-app npm run migration:run
echo ✅ Migrações executadas
goto menu

:force
echo =================================
echo FORÇANDO EXECUÇÃO CNC
echo =================================
docker-compose exec cnc-app npm run force
echo ✅ Execução forçada concluída
goto menu

:exit
echo ✅ Até logo!
pause
exit /b 0