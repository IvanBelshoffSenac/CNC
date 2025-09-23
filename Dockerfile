# =================================================================
# DOCKERFILE SISTEMA CNC - VERSÃO SIMPLIFICADA
# =================================================================
# Container único para execução da aplicação Node.js/TypeScript

FROM node:20-alpine

# Metadados básicos
LABEL description="Sistema CNC - Coleta automatizada de dados econômicos"
LABEL version="1.0.0"

# Instalar apenas utilitários essenciais
RUN apk add --no-cache dumb-init tzdata ca-certificates

# Configurar timezone para Brasil
ENV TZ=America/Sao_Paulo
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime

# Configurar diretório de trabalho
WORKDIR /app

# Copiar package.json e instalar dependências
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copiar código fonte
COPY . .

# Compilar TypeScript
RUN npm run build

# Configurar Playwright para usar browsers do host
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Criar diretórios para logs e temp
RUN mkdir -p logs temp

# Variáveis de ambiente padrão
ENV NODE_ENV=production

# Comando de execução
CMD ["dumb-init", "node", "./build/index.js"]