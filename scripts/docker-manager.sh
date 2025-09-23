#!/bin/bash
# =================================================================
# SCRIPT DE DEPLOYMENT - SISTEMA CNC
# =================================================================
# Facilita o deployment e gerenciamento do sistema via Docker

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Funções auxiliares
print_header() {
    echo -e "${BLUE}=================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}=================================${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Verificar se Docker está instalado
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker não está instalado!"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose não está instalado!"
        exit 1
    fi
    
    print_success "Docker e Docker Compose encontrados"
}

# Verificar arquivo .env
check_env() {
    if [ ! -f ".env" ]; then
        print_warning "Arquivo .env não encontrado!"
        echo "Copiando .env.docker.example para .env..."
        cp .env.docker.example .env
        print_warning "IMPORTANTE: Edite o arquivo .env com suas configurações!"
        echo "Pressione Enter para continuar..."
        read
    fi
    print_success "Arquivo .env encontrado"
}

# Criar diretórios necessários
create_dirs() {
    mkdir -p logs temp
    print_success "Diretórios criados: logs/, temp/"
}

# Build da aplicação
build_app() {
    print_header "BUILDING APLICAÇÃO CNC"
    docker-compose build --no-cache cnc-app
    print_success "Build concluído"
}

# Iniciar serviços
start_services() {
    print_header "INICIANDO SERVIÇOS"
    docker-compose up -d
    print_success "Serviços iniciados"
    
    echo ""
    print_header "STATUS DOS SERVIÇOS"
    docker-compose ps
}

# Parar serviços
stop_services() {
    print_header "PARANDO SERVIÇOS"
    docker-compose down
    print_success "Serviços parados"
}

# Logs da aplicação
show_logs() {
    print_header "LOGS DA APLICAÇÃO CNC"
    docker-compose logs -f cnc-app
}

# Status dos serviços
show_status() {
    print_header "STATUS DOS SERVIÇOS"
    docker-compose ps
    
    echo ""
    print_header "HEALTH CHECK"
    docker-compose exec cnc-app node -e "console.log('CNC System: OK')" 2>/dev/null && print_success "Aplicação CNC: Healthy" || print_warning "Aplicação CNC: Não disponível"
    docker-compose exec mysql mysqladmin ping -h localhost --silent && print_success "MySQL: Healthy" || print_warning "MySQL: Não disponível"
}

# Backup do banco
backup_database() {
    print_header "BACKUP DO BANCO DE DADOS"
    BACKUP_FILE="backup_cnc_$(date +%Y%m%d_%H%M%S).sql"
    docker-compose exec mysql mysqldump -u root -p cnc > "$BACKUP_FILE"
    print_success "Backup salvo em: $BACKUP_FILE"
}

# Executar migração
run_migration() {
    print_header "EXECUTANDO MIGRAÇÕES"
    docker-compose exec cnc-app npm run migration:run
    print_success "Migrações executadas"
}

# Forçar execução
force_execution() {
    print_header "FORÇANDO EXECUÇÃO CNC"
    docker-compose exec cnc-app npm run force
    print_success "Execução forçada concluída"
}

# Menu principal
show_menu() {
    echo ""
    print_header "SISTEMA CNC - GERENCIAMENTO DOCKER"
    echo "1) 🚀 Deploy completo (build + start)"
    echo "2) 🔨 Build aplicação"
    echo "3) ▶️  Iniciar serviços"
    echo "4) ⏹️  Parar serviços"
    echo "5) 📋 Ver logs"
    echo "6) 📊 Status dos serviços"
    echo "7) 💾 Backup banco de dados"
    echo "8) 🔄 Executar migrações"
    echo "9) ⚡ Forçar execução CNC"
    echo "0) 🚪 Sair"
    echo ""
    read -p "Escolha uma opção: " choice
}

# Main script
main() {
    check_docker
    
    case $1 in
        "deploy")
            check_env
            create_dirs
            build_app
            start_services
            ;;
        "build")
            build_app
            ;;
        "start")
            start_services
            ;;
        "stop")
            stop_services
            ;;
        "logs")
            show_logs
            ;;
        "status")
            show_status
            ;;
        "backup")
            backup_database
            ;;
        "migrate")
            run_migration
            ;;
        "force")
            force_execution
            ;;
        *)
            while true; do
                show_menu
                case $choice in
                    1)
                        check_env
                        create_dirs
                        build_app
                        start_services
                        ;;
                    2)
                        build_app
                        ;;
                    3)
                        start_services
                        ;;
                    4)
                        stop_services
                        ;;
                    5)
                        show_logs
                        ;;
                    6)
                        show_status
                        ;;
                    7)
                        backup_database
                        ;;
                    8)
                        run_migration
                        ;;
                    9)
                        force_execution
                        ;;
                    0)
                        print_success "Até logo!"
                        exit 0
                        ;;
                    *)
                        print_error "Opção inválida!"
                        ;;
                esac
                echo ""
                read -p "Pressione Enter para continuar..."
            done
            ;;
    esac
}

# Executar script
main $1