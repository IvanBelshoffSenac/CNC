@echo off
REM =================================================================
REM SCRIPT DE DEPLOYMENT WINDOWS - SISTEMA CNC
REM =================================================================
REM Facilita o deployment e gerenciamento do sistema via Docker no Windows

chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

REM Verificar se Docker está instalado
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Docker nao esta instalado!
    pause
    exit /b 1
)

docker-compose --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Docker Compose nao esta instalado!
    pause
    exit /b 1
)

echo [OK] Docker e Docker Compose encontrados

REM Verificar arquivo .env
if not exist ".env" (
    echo [AVISO] Arquivo .env nao encontrado!
    echo Copiando .env.docker.example para .env...
    copy .env.docker.example .env >nul
    echo IMPORTANTE: Edite o arquivo .env com suas configuracoes!
    pause
)
echo [OK] Arquivo .env encontrado

REM Criar diretórios necessários
if not exist "logs" mkdir logs >nul 2>&1
if not exist "temp" mkdir temp >nul 2>&1
echo [OK] Diretorios criados: logs/, temp/

REM Menu principal
:menu
echo.
echo =================================
echo SISTEMA CNC - GERENCIAMENTO DOCKER
echo =================================
echo 1) [DEPLOY] Deploy completo (build + start)
echo 2) [BUILD] Build aplicacao
echo 3) [START] Iniciar servicos
echo 4) [STOP] Parar servicos
echo 5) [LOGS] Ver logs
echo 6) [STATUS] Status dos servicos
echo 7) [BACKUP] Backup banco de dados
echo 8) [MIGRATE] Executar migracoes
echo 9) [FORCE] Forcar execucao CNC
echo 0) [SAIR] Sair
echo.
set /p choice="Escolha uma opcao: "

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
echo [ERRO] Opcao invalida!
goto menu

:deploy
echo =================================
echo BUILDING + INICIANDO SERVICOS
echo =================================
docker-compose build --no-cache cnc-app
docker-compose up -d
echo [OK] Deploy concluido
goto menu

:build
echo =================================
echo BUILDING APLICACAO CNC
echo =================================
docker-compose build --no-cache cnc-app
echo [OK] Build concluido
goto menu

:start
echo =================================
echo INICIANDO SERVICOS
echo =================================
docker-compose up -d
echo [OK] Servicos iniciados
docker-compose ps
goto menu

:stop
echo =================================
echo PARANDO SERVICOS
echo =================================
docker-compose down
echo [OK] Servicos parados
goto menu

:logs
echo =================================
echo LOGS DA APLICACAO CNC
echo =================================
docker-compose logs -f cnc-app
goto menu

:status
echo =================================
echo STATUS DOS SERVICOS
echo =================================
docker-compose ps
echo.
echo =================================
echo HEALTH CHECK
echo =================================
docker-compose exec cnc-app node -e "console.log('CNC System: OK')" 2>nul && echo [OK] Aplicacao CNC: Healthy || echo [AVISO] Aplicacao CNC: Nao disponivel
docker-compose exec mysql mysqladmin ping -h localhost --silent 2>nul && echo [OK] MySQL: Healthy || echo [AVISO] MySQL: Nao disponivel
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
echo [OK] Backup salvo em: %BACKUP_FILE%
goto menu

:migrate
echo =================================
echo EXECUTANDO MIGRACOES
echo =================================
docker-compose exec cnc-app npm run migration:run
echo [OK] Migracoes executadas
goto menu

:force
echo =================================
echo FORCANDO EXECUCAO CNC
echo =================================
docker-compose exec cnc-app npm run force
echo [OK] Execucao forcada concluida
goto menu

:exit
echo [OK] Ate logo!
pause
exit /b 0