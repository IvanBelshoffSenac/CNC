#!/bin/bash
# =================================================================
# SCRIPT DE DEPLOY DOCKER SIMPLIFICADO - SISTEMA CNC (Linux/Mac)
# =================================================================

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Funções de output
success() { echo -e "${GREEN}✅ $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; }
warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
info() { echo -e "${CYAN}ℹ️  $1${NC}"; }

# Header
clear
echo -e "${CYAN}=================================${NC}"
echo -e "${CYAN}SISTEMA CNC - DEPLOY SIMPLIFICADO${NC}"
echo -e "${CYAN}=================================${NC}"

# Verificar Docker
if ! command -v docker &> /dev/null; then
    error "Docker não está instalado!"
    exit 1
fi
success "Docker encontrado"

# Verificar .env.docker
if [ ! -f ".env.docker" ]; then
    error "Arquivo .env.docker não encontrado!"
    
    if [ -f ".env.docker.example" ]; then
        warning "Copiando .env.docker.example para .env.docker..."
        cp ".env.docker.example" ".env.docker"
        warning "IMPORTANTE: Edite o arquivo .env.docker com suas configurações específicas!"
        info "Configure: HOST, DB_USER, PASSWORD, CREDENTIALS_*, MAIL_* etc."
        read -p "Pressione Enter para continuar após editar o .env.docker..."
    elif [ -f ".env" ]; then
        warning "Copiando .env para .env.docker..."
        cp ".env" ".env.docker"
        warning "IMPORTANTE: Edite o .env.docker removendo aspas duplas dos valores!"
        read -p "Pressione Enter para continuar após editar o .env.docker..."
    else
        error "Nenhum arquivo de configuração encontrado!"
        warning "Crie um arquivo .env.docker com as configurações necessárias."
        read -p "Pressione Enter para sair..."
        exit 1
    fi
fi
success "Arquivo .env.docker encontrado"

# Usando imagem oficial Playwright
info "Usando imagem oficial Playwright com browsers integrados"
success "Browsers já incluidos na imagem Docker oficial"

# Build da imagem
echo ""
info "📦 Building imagem Docker..."
docker build -t cnc-app .

if [ $? -ne 0 ]; then
    error "Erro no build da imagem!"
    exit 1
fi
success "Imagem criada com sucesso"

# Parar container anterior se existir
info "🛑 Parando container anterior..."
docker stop cnc-sistema 2>/dev/null
docker rm cnc-sistema 2>/dev/null

# Criar diretórios se não existirem com permissões corretas
mkdir -p logs temp
chmod 777 logs temp

# Executar novo container com configurações oficiais Playwright
info "🚀 Iniciando novo container..."
docker run -d \
  --name cnc-sistema \
  --env-file .env.docker \
  --restart unless-stopped \
  --init \
  --ipc=host \
  --cap-add=SYS_ADMIN \
  -v $(pwd)/logs:/app/logs \
  -v $(pwd)/temp:/app/temp \
  cnc-app

if [ $? -ne 0 ]; then
    error "Erro ao iniciar container!"
    exit 1
fi

success "Container iniciado com sucesso!"

# Status
echo ""
info "📊 Status do container:"
docker ps -f name=cnc-sistema

echo ""
success "✅ Deploy concluído!"
echo ""
echo -e "${CYAN}📋 Comandos úteis:${NC}"
echo "   Ver logs:      docker logs cnc-sistema -f"
echo "   Parar:         docker stop cnc-sistema"
echo "   Reiniciar:     docker restart cnc-sistema"
echo "   Status:        docker ps -f name=cnc-sistema"
echo "   Teste:         docker exec -it cnc-sistema node build/force.js"
echo ""