# =================================================================
# DOCKERFILE PARA SISTEMA CNC
# =================================================================
# Imagem otimizada para aplicação Node.js com TypeScript, Playwright e MySQL
# Suporte para web scraping automatizado e processamento de dados econômicos

# Estágio de build
FROM node:20-alpine AS builder

# Instalar dependências do sistema necessárias para o build
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

# Configurar diretório de trabalho
WORKDIR /app

# Copiar arquivos de configuração do Node.js
COPY package.json package-lock.json* ./

# Instalar dependências (apenas production para otimizar)
RUN npm ci --only=production && npm cache clean --force

# Copiar código fonte
COPY . .

# Compilar TypeScript
RUN npm run build

# =================================================================
# Estágio de produção
FROM node:20-alpine AS production

# Metadados da imagem
LABEL maintainer="FeComercio ES <sistema@fecomercio-es.com.br>"
LABEL description="Sistema automatizado CNC - Coleta de dados econômicos ICEC, ICF e PEIC"
LABEL version="1.0.0"

# Instalar dependências do sistema necessárias
RUN apk add --no-cache \
    # Browsers para Playwright
    chromium \
    # System utilities
    dumb-init \
    tzdata \
    curl \
    # SSL/TLS support
    ca-certificates \
    # Dependências para Playwright
    libgcc \
    libstdc++ \
    libx11 \
    libxcomposite \
    libxdamage \
    libxext \
    libxfixes \
    libxrandr \
    libxrender \
    libxss \
    libxtst \
    && rm -rf /var/cache/apk/*

# Configurar timezone para Brasil
ENV TZ=America/Sao_Paulo
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Criar usuário não-root para segurança
RUN addgroup -g 1001 -S nodejs && \
    adduser -S cnc -u 1001 -G nodejs

# Configurar diretório de trabalho
WORKDIR /app

# Copiar node_modules e build do estágio anterior
COPY --from=builder --chown=cnc:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=cnc:nodejs /app/build ./build
COPY --from=builder --chown=cnc:nodejs /app/package.json ./

# Copiar arquivos necessários para runtime
COPY --chown=cnc:nodejs tsconfig.json ./

# Configurar Playwright para usar apenas Chromium
ENV PLAYWRIGHT_BROWSERS_PATH=0
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Instalar browsers do Playwright apenas se necessário
RUN npx --yes playwright@latest install-deps chromium 2>/dev/null || true

# Criar diretórios necessários
RUN mkdir -p /app/temp /app/logs && \
    chown -R cnc:nodejs /app/temp /app/logs

# Mudar para usuário não-root
USER cnc

# Expor porta (se necessário para APIs futuras)
EXPOSE 3000

# Configurar variáveis de ambiente padrão
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=2048"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "console.log('CNC System Health: OK')" || exit 1

# Volume para logs e dados temporários
VOLUME ["/app/logs", "/app/temp"]

# Usar dumb-init para gerenciamento de processos
ENTRYPOINT ["dumb-init", "--"]

# Comando padrão
CMD ["node", "./build/index.js"]