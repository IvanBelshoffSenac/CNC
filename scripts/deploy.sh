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

# Verificar .env
if [ ! -f ".env" ]; then
    error "Arquivo .env não encontrado!"
    exit 1
fi
success "Arquivo .env encontrado"

# Verificar Playwright
if [ -d ~/.cache/ms-playwright ]; then
    success "Browsers Playwright encontrados"
else
    warning "Browsers Playwright não encontrados!"
    echo -e "${YELLOW}Execute: npx playwright install${NC}"
    read -p "Pressione Enter para continuar mesmo assim..."
fi

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

# Criar diretórios se não existirem
mkdir -p logs temp

# Executar novo container
info "🚀 Iniciando novo container..."
docker run -d \
  --name cnc-sistema \
  --env-file .env \
  --restart unless-stopped \
  -v $(pwd)/logs:/app/logs \
  -v $(pwd)/temp:/app/temp \
  -v ~/.cache/ms-playwright:/ms-playwright:ro \
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
echo ""