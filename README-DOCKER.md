# 🐳 Sistema CNC - Deployment com Docker

> Guia completo para executar o Sistema CNC usando Docker e Docker Compose

[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![Docker Compose](https://img.shields.io/badge/Docker%20Compose-Configured-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![Node.js](https://img.shields.io/badge/Node.js-20-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![MySQL](https://img.shields.io/badge/MySQL-8.0-005C84?style=for-the-badge&logo=mysql&logoColor=white)](https://www.mysql.com/)

## 📋 Índice

- [Pré-requisitos](#-pré-requisitos)
- [Instalação Rápida](#-instalação-rápida)
- [Estrutura Docker](#-estrutura-docker)
- [Configuração Detalhada](#-configuração-detalhada)
- [Gerenciamento via Scripts](#-gerenciamento-via-scripts)
- [Comandos Docker Essenciais](#-comandos-docker-essenciais)
- [Monitoramento e Logs](#-monitoramento-e-logs)
- [Backup e Restauração](#-backup-e-restauração)
- [Troubleshooting Docker](#-troubleshooting-docker)
- [Configurações Avançadas](#-configurações-avançadas)

## 🚀 Pré-requisitos

### Softwares Necessários

- **[Docker Desktop](https://docs.docker.com/get-docker/)** 20.10+ ou Docker Engine
- **[Docker Compose](https://docs.docker.com/compose/install/)** 2.0+
- **Git** (para clonar o repositório)

### Recursos de Sistema Recomendados

- **RAM**: 4GB mínimo (8GB recomendado)
- **Disco**: 10GB espaço livre
- **CPU**: 2 cores mínimo (4 cores recomendado)
- **Internet**: Conexão estável para web scraping

### Verificação de Pré-requisitos

Execute os comandos abaixo para verificar se tudo está instalado:

```bash
# Verificar Docker
docker --version
# Saída esperada: Docker version 20.10.x ou superior

# Verificar Docker Compose
docker-compose --version
# Saída esperada: Docker Compose version 2.0.x ou superior

# Verificar se Docker está rodando
docker ps
# Deve retornar uma lista (mesmo que vazia) sem erros
```

## ⚡ Instalação Rápida

### 1. Clone o Repositório

```bash
git clone https://github.com/IvanBelshoffSenac/CNC.git
cd CNC
```

### 2. Configure Variáveis de Ambiente

```bash
# Windows
copy .env.docker.example .env

# Linux/Mac
cp .env.docker.example .env
```

### 3. Edite as Configurações

Abra o arquivo `.env` e configure suas credenciais:

```env
# Credenciais CNC (OBRIGATÓRIO)
CREDENTIALS_USER=seu_email@fecomercio-es.com.br
CREDENTIALS_PASSWORD=sua_senha_cnc

# Email para notificações (OBRIGATÓRIO)
NOTIFICATION_EMAIL=seu_email@empresa.com.br
MAIL_PASSWORD=sua_senha_email

# Senha do banco (recomendado alterar)
MYSQL_ROOT_PASSWORD=root123_secure
PASSWORD=fecomercio_secure_2024
```

### 4. Execute o Deploy

```bash
# Windows
scripts\docker-manager.bat

# Linux/Mac
chmod +x scripts/docker-manager.sh
./scripts/docker-manager.sh deploy
```

### 5. Verificar Funcionamento

```bash
# Ver status dos serviços
docker-compose ps

# Ver logs da aplicação
docker-compose logs -f cnc-app

# Verificar saúde dos containers
docker-compose exec cnc-app node -e "console.log('CNC System: OK')"
```

## 🏗 Estrutura Docker

### Arquivos Docker do Projeto

```
CNC/
├── 📄 Dockerfile                    # Imagem da aplicação CNC
├── 📄 docker-compose.yml           # Orquestração dos serviços
├── 📄 .dockerignore                # Exclusões para build
├── 📄 .env.docker.example          # Template de variáveis
└── 📁 docker/                      # Configurações específicas
    └── 📁 mysql/
        ├── 📁 conf.d/              # Configurações MySQL
        │   └── 📄 cnc-custom.cnf   # Otimizações específicas
        └── 📁 init/                # Scripts de inicialização
            └── 📄 01-init-cnc.sh   # Setup inicial do banco
```

### Serviços Configurados

#### 🛢 MySQL Database (`mysql`)
- **Imagem**: `mysql:8.0`
- **Porta**: `3306`
- **Volume**: Dados persistentes em `cnc_mysql_data`
- **Configurações**: Otimizadas para o sistema CNC
- **Health Check**: Verificação automática de conectividade

#### 🚀 Aplicação CNC (`cnc-app`)
- **Build**: Multi-stage com Node.js 20 Alpine
- **Dependências**: Playwright, TypeORM, MySQL2
- **Volumes**: Logs e arquivos temporários persistentes
- **Health Check**: Verificação de funcionamento da aplicação
- **Restart Policy**: `unless-stopped`

## ⚙️ Configuração Detalhada

### Docker Compose - Principais Configurações

#### Configuração MySQL

```yaml
mysql:
  image: mysql:8.0
  environment:
    MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:-root123}
    MYSQL_DATABASE: ${DB_NAME:-cnc}
    MYSQL_USER: ${DB_USER:-fecomercio}
    MYSQL_PASSWORD: ${PASSWORD:-root}
  volumes:
    - mysql_data:/var/lib/mysql                    # Dados persistentes
    - ./docker/mysql/conf.d:/etc/mysql/conf.d:ro  # Configurações
    - ./docker/mysql/init:/docker-entrypoint-initdb.d:ro  # Scripts init
  deploy:
    resources:
      limits:
        memory: 1G
        cpus: '0.5'
```

#### Configuração Aplicação CNC

```yaml
cnc-app:
  build:
    context: .
    dockerfile: Dockerfile
    target: production
  environment:
    HOST: mysql                    # Nome do serviço MySQL
    NODE_ENV: production
    TZ: America/Sao_Paulo
  volumes:
    - ./logs:/app/logs            # Logs persistentes
    - ./temp:/app/temp            # Arquivos temporários
  depends_on:
    mysql:
      condition: service_healthy  # Aguarda MySQL estar pronto
```

### Dockerfile - Multi-stage Build

#### Estágio de Build
```dockerfile
FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++ git
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY . .
RUN npm run build
```

#### Estágio de Produção
```dockerfile
FROM node:20-alpine AS production
RUN apk add --no-cache chromium dumb-init tzdata ca-certificates
ENV TZ=America/Sao_Paulo
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
```

### Configurações MySQL Otimizadas

O arquivo `docker/mysql/conf.d/cnc-custom.cnf` contém:

```ini
[mysqld]
# Charset e timezone
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci
default-time-zone = '-03:00'

# Performance otimizada para CNC
innodb_buffer_pool_size = 512M
innodb_log_buffer_size = 16M
query_cache_size = 64M

# Configurações para web scraping
innodb_lock_wait_timeout = 120
bulk_insert_buffer_size = 32M

# Logs de monitoramento
slow_query_log = 1
long_query_time = 5
```

### Script de Inicialização MySQL

O arquivo `docker/mysql/init/01-init-cnc.sh` executa:

```bash
# Cria usuário com permissões específicas
CREATE USER IF NOT EXISTS '$MYSQL_USER'@'%' IDENTIFIED BY '$MYSQL_PASSWORD';
GRANT ALL PRIVILEGES ON $MYSQL_DATABASE.* TO '$MYSQL_USER'@'%';

# Configurações específicas CNC
SET GLOBAL time_zone = '-03:00';
SET GLOBAL innodb_flush_log_at_trx_commit = 2;
```

## 🎛 Gerenciamento via Scripts

### Scripts Disponíveis

#### Windows
- **PowerShell (Recomendado)**: `scripts\docker-manager.ps1`
- **Batch (Alternativo)**: `scripts\docker-manager.bat`

#### Linux/Mac: `scripts/docker-manager.sh`

> **Nota**: O script PowerShell oferece melhor suporte a Unicode/emojis no Windows

### Menu Interativo

```
=================================
SISTEMA CNC - GERENCIAMENTO DOCKER
=================================
1) 🚀 Deploy completo (build + start)
2) 🔨 Build aplicação
3) ▶️  Iniciar serviços
4) ⏹️  Parar serviços
5) 📋 Ver logs
6) 📊 Status dos serviços
7) 💾 Backup banco de dados
8) 🔄 Executar migrações
9) ⚡ Forçar execução CNC
0) 🚪 Sair
```

### Execução Direta dos Scripts

```bash
# Deploy completo
./scripts/docker-manager.sh deploy

# Ver status
./scripts/docker-manager.sh status

# Fazer backup
./scripts/docker-manager.sh backup

# Executar migrações
./scripts/docker-manager.sh migrate
```

## 🔧 Comandos Docker Essenciais

### Gerenciamento de Serviços

```bash
# Iniciar todos os serviços
docker-compose up -d

# Parar todos os serviços
docker-compose down

# Rebuild e reiniciar
docker-compose up -d --build

# Ver status
docker-compose ps

# Ver recursos consumidos
docker stats
```

### Logs e Monitoramento

```bash
# Logs da aplicação em tempo real
docker-compose logs -f cnc-app

# Logs do MySQL
docker-compose logs -f mysql

# Logs de todos os serviços
docker-compose logs -f

# Ver últimas 100 linhas
docker-compose logs --tail=100 cnc-app
```

### Execução de Comandos

```bash
# Entrar no container da aplicação
docker-compose exec cnc-app sh

# Executar comando específico
docker-compose exec cnc-app npm run force

# Executar migrações
docker-compose exec cnc-app npm run migration:run

# Verificar saúde da aplicação
docker-compose exec cnc-app node -e "console.log('CNC Health: OK')"
```

### Gerenciamento de Dados

```bash
# Backup do banco de dados
docker-compose exec mysql mysqldump -u root -p cnc > backup_cnc.sql

# Restaurar backup
docker-compose exec -T mysql mysql -u root -p cnc < backup_cnc.sql

# Acessar banco via cliente MySQL
docker-compose exec mysql mysql -u root -p cnc
```

## 📊 Monitoramento e Logs

### Health Checks Configurados

#### Aplicação CNC
```yaml
healthcheck:
  test: ["CMD", "node", "-e", "console.log('CNC Health: OK')"]
  timeout: 10s
  retries: 3
  interval: 30s
  start_period: 120s
```

#### MySQL
```yaml
healthcheck:
  test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
  timeout: 10s
  retries: 5
  interval: 30s
  start_period: 60s
```

### Verificação de Status

```bash
# Status detalhado dos containers
docker-compose ps

# Health check manual
docker-compose exec cnc-app node -e "console.log('CNC System: OK')"
docker-compose exec mysql mysqladmin ping -h localhost

# Recursos consumidos
docker stats cnc-application cnc-mysql

# Logs estruturados
docker-compose logs --since="1h" cnc-app | grep "ERROR\|SUCCESS"
```

### Localizações dos Logs

- **Aplicação**: `./logs/` (mapeado do container)
- **MySQL**: Logs internos do container MySQL
- **Docker**: `docker-compose logs`
- **Sistema**: Logs específicos por serviço

## 💾 Backup e Restauração

### Backup Automático via Script

```bash
# Backup completo com timestamp
./scripts/docker-manager.sh backup

# Saída: backup_cnc_20250923_140500.sql
```

### Backup Manual

```bash
# Backup simples
docker-compose exec mysql mysqldump -u root -p cnc > backup.sql

# Backup com estrutura e dados
docker-compose exec mysql mysqldump -u root -p --single-transaction --routines --triggers cnc > backup_complete.sql

# Backup apenas estrutura
docker-compose exec mysql mysqldump -u root -p --no-data cnc > backup_structure.sql
```

### Restauração

```bash
# Restaurar backup completo
docker-compose exec -T mysql mysql -u root -p cnc < backup_complete.sql

# Verificar restauração
docker-compose exec mysql mysql -u root -p -e "USE cnc; SHOW TABLES;"
```

### Backup de Volumes Docker

```bash
# Backup do volume de dados MySQL
docker run --rm -v cnc_mysql_data:/data -v $(pwd):/backup alpine tar czf /backup/mysql_volume_backup.tar.gz -C /data .

# Restaurar volume
docker run --rm -v cnc_mysql_data:/data -v $(pwd):/backup alpine tar xzf /backup/mysql_volume_backup.tar.gz -C /data
```

## 🚨 Troubleshooting Docker

### Problemas Comuns e Soluções

#### 1. Container não inicia

```bash
# Verificar logs de erro
docker-compose logs cnc-app

# Verificar configurações
docker-compose config

# Rebuild completo
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

#### 2. Erro de conexão MySQL

```bash
# Verificar status do MySQL
docker-compose ps mysql

# Verificar logs do MySQL
docker-compose logs mysql

# Testar conectividade
docker-compose exec cnc-app ping mysql

# Resetar banco completamente
docker-compose down
docker volume rm cnc_mysql_data
docker-compose up -d
```

#### 3. Problemas de Performance

```bash
# Verificar recursos
docker stats

# Ajustar limites no docker-compose.yml
deploy:
  resources:
    limits:
      memory: 4G
      cpus: '2.0'

# Limpar cache Docker
docker system prune -a
```

#### 4. Erro de permissões (Linux)

```bash
# Ajustar permissões dos volumes
sudo chown -R $USER:$USER logs/ temp/

# Verificar usuário do container
docker-compose exec cnc-app id

# Ajustar UID/GID se necessário
```

#### 5. Porta já em uso

```bash
# Verificar quem está usando a porta
netstat -tulpn | grep :3306

# Parar processo conflitante ou alterar porta no docker-compose.yml
ports:
  - "3307:3306"  # Usar porta 3307 no host
```

#### 6. Problemas com Playwright

```bash
# Se o container não inicializar devido ao Playwright
# O Dockerfile já está configurado para usar apenas Chromium

# Verificar se o Playwright está funcionando
docker-compose exec cnc-app npx playwright --version

# Testar web scraping manualmente
docker-compose exec cnc-app npm run force

# Configurações especiais no Dockerfile:
# ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

#### 7. Problemas de Codificação Windows

```bash
# Se você ver caracteres estranhos no script Windows:
# O script foi atualizado para usar codificação UTF-8

# Use o PowerShell como alternativa:
docker-compose up -d --build

# Ou execute comandos diretos:
docker-compose build cnc-app
docker-compose up -d
```

### Comandos de Diagnóstico

```bash
# Informações do sistema Docker
docker info
docker version

# Espaço em disco
docker system df

# Verificar rede
docker network ls
docker network inspect cnc_network

# Inspecionar volumes
docker volume ls
docker volume inspect cnc_mysql_data

# Verificar imagens
docker images
```

### Limpeza e Manutenção

```bash
# Limpar containers parados
docker container prune

# Limpar imagens não utilizadas
docker image prune -a

# Limpar volumes órfãos
docker volume prune

# Limpeza completa (CUIDADO!)
docker system prune -a --volumes
```

## ⚙️ Configurações Avançadas

### Configuração de Recursos

#### Para Desenvolvimento
```yaml
deploy:
  resources:
    limits:
      memory: 2G
      cpus: '1.0'
    reservations:
      memory: 1G
      cpus: '0.5'
```

#### Para Produção
```yaml
deploy:
  resources:
    limits:
      memory: 4G
      cpus: '2.0'
    reservations:
      memory: 2G
      cpus: '1.0'
```

### Configurações de Rede

```yaml
networks:
  cnc-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
```

### Configurações de Segurança

```yaml
security_opt:
  - no-new-privileges:true
  - seccomp:unconfined  # Para Playwright se necessário

user: "1001:1001"  # Usuário não-root
read_only: true    # Sistema de arquivos somente leitura
```

### Variáveis de Ambiente Específicas Docker

```env
# Performance
NODE_OPTIONS=--max-old-space-size=2048

# Timezone
TZ=America/Sao_Paulo

# Playwright
PLAYWRIGHT_BROWSERS_PATH=/usr/bin
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# MySQL
MYSQL_ROOT_PASSWORD=root123_secure
AUTO_CREATE_TABLES=true
```

### Configuração para Múltiplos Ambientes

#### docker-compose.override.yml (desenvolvimento)
```yaml
version: '3.8'
services:
  cnc-app:
    environment:
      NODE_ENV: development
    volumes:
      - ./src:/app/src:ro  # Hot reload
    command: npm run dev
```

#### docker-compose.prod.yml (produção)
```yaml
version: '3.8'
services:
  cnc-app:
    restart: always
    deploy:
      resources:
        limits:
          memory: 4G
          cpus: '2.0'
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### Deploy em Produção

```bash
# Produção com configurações específicas
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Com variáveis específicas
docker-compose --env-file .env.production up -d
```

## 📈 Monitoramento Avançado

### Prometheus + Grafana (Opcional)

#### docker-compose.monitoring.yml
```yaml
version: '3.8'
services:
  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
```

### Logs Centralizados

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "5"
    labels: "service=cnc"
```

## 🎯 Checklist de Deploy

### Antes do Deploy
- [ ] Docker e Docker Compose instalados
- [ ] Credenciais CNC configuradas no `.env`
- [ ] Email SMTP configurado
- [ ] Portas 3306 livres (ou configurar alternativas)
- [ ] Espaço em disco suficiente (10GB+)

### Durante o Deploy
- [ ] Build das imagens concluído sem erros
- [ ] Containers iniciaram com sucesso
- [ ] Health checks passando
- [ ] MySQL conectando corretamente
- [ ] Aplicação CNC responsiva

### Após o Deploy
- [ ] Logs sem erros críticos
- [ ] Migrações executadas
- [ ] Teste de execução forçada funcionando
- [ ] Emails de notificação enviados
- [ ] Backup automático configurado

## 📞 Suporte Docker

### Recursos Úteis

- **Docker Docs**: https://docs.docker.com/
- **Docker Compose**: https://docs.docker.com/compose/
- **Node.js Alpine**: https://hub.docker.com/_/node
- **MySQL**: https://hub.docker.com/_/mysql

### Comandos de Emergência

```bash
# Parar tudo imediatamente
docker-compose kill

# Remover tudo (CUIDADO!)
docker-compose down -v --remove-orphans

# Restart completo
docker-compose restart

# Ver consumo de recursos em tempo real
docker stats --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"
```

---

## 🏆 Conclusão

Este guia fornece todas as informações necessárias para executar o Sistema CNC usando Docker. A containerização oferece:

- ✅ **Isolamento**: Ambiente consistente independente do sistema host
- ✅ **Portabilidade**: Executa em qualquer sistema com Docker
- ✅ **Escalabilidade**: Fácil ajuste de recursos conforme necessidade
- ✅ **Manutenibilidade**: Atualizações e rollbacks simplificados
- ✅ **Monitoramento**: Health checks e logs centralizados

Para dúvidas específicas sobre Docker, consulte a documentação oficial ou entre em contato com a equipe de desenvolvimento.

---

<p align="center">
  <b>🐳 Sistema CNC - Docker Deployment Guide</b><br>
  <i>Desenvolvido com ❤️ para FeComércio ES</i><br>
  <i>Containerizado com 🐳 Docker para máxima portabilidade</i>
</p>