# =================================================================
# DOCKERFILE SISTEMA CNC - USANDO IMAGEM OFICIAL PLAYWRIGHT
# =================================================================
# Usando imagem oficial do Playwright com browsers pré-instalados

FROM mcr.microsoft.com/playwright:v1.54.1-noble

# Metadados básicos
LABEL description="Sistema CNC - Coleta automatizada de dados econômicos"
LABEL version="2.0.0"

# Instalar utilitários adicionais
RUN apt-get update && apt-get install -y \
    tzdata \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Configurar timezone para Brasil
ENV TZ=America/Sao_Paulo
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Configurar diretório de trabalho
WORKDIR /app

# Configurar usuário para segurança (recomendação oficial)
USER root

# Copiar package.json e instalar dependências
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copiar código fonte
COPY . .

# Compilar TypeScript
RUN npm run build

# Criar diretórios para logs e temp
RUN mkdir -p logs temp

# Configurar permissões
RUN chown -R pwuser:pwuser /app

# Variáveis de ambiente
ENV NODE_ENV=production

# Mudar para usuário não-root para execução
USER pwuser

# Comando de execução com init para evitar processos zumbi
CMD ["node", "./build/index.js"]