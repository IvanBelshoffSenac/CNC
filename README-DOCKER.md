# 🐳 Sistema CNC - Deploy Docker Simplificado

Documentação para execução do sistema CNC via container Docker único.

## 📋 Pré-requisitos

### 1. **Docker Desktop**
```powershell
# Verificar instalação
docker --version
```

### 2. **Playwright Global (Host)**
```powershell
# Instalar Playwright globalmente
npm install -g playwright

# Baixar browsers
npx playwright install
```

### 3. **Banco MySQL Separado**
Configure seu próprio banco MySQL (local, Docker separado, ou remoto).

## 📁 Estrutura do Projeto

```
CNC/
├── 📄 Dockerfile              # Configuração do container
├── 📄 .dockerignore          # Arquivos excluídos do build
├── 📄 .env                   # Variáveis para execução LOCAL
├── 📄 .env.docker            # Variáveis para execução DOCKER
├── 📄 README-DOCKER.md       # Esta documentação
├── 📁 scripts/               # Scripts de automação
│   ├── 📄 deploy.ps1         # Deploy automatizado (Windows)
│   ├── 📄 deploy.sh          # Deploy automatizado (Linux/Mac)  
│   └── 📄 utils.ps1          # Utilitários de gerenciamento
├── 📁 src/                   # Código fonte TypeScript
├── 📁 logs/                  # Logs da aplicação (criado automaticamente)
└── 📁 temp/                  # Arquivos temporários (criado automaticamente)
```

## 🔧 Configuração dos Ambientes

### **Para Execução Local (.env)**
```env
# Configurações para npm run dev (local)
NODE_ENV=development
HOST="10.27.4.136"    # Com aspas (conforme necessário)
DB_USER="fecomercio"   # Com aspas
DB_NAME="cnc"          # Com aspas
PASSWORD="root"        # Com aspas
```

### **Para Execução Docker (.env.docker)**
```env
# Configurações para container Docker
NODE_ENV=production
HOST=10.27.4.136      # Sem aspas (Docker)
DB_USER=fecomercio     # Sem aspas
DB_NAME=cnc            # Sem aspas
PASSWORD=root          # Sem aspas
```

## ⚡ Deploy Rápido

### 1. **Configurar Variáveis de Ambiente**

#### **Para execução local - edite `.env`:**
```env
# Banco de dados (local)
HOST="10.27.4.136"      # Com aspas para execução local
DB_USER="fecomercio"     # Com aspas
DB_NAME="cnc"            # Com aspas
PASSWORD="root"          # Com aspas

# Credenciais CNC
CREDENTIALS_USER="seu_usuario@empresa.com"
CREDENTIALS_PASSWORD="sua_senha"

# Email notificações
NOTIFICATION_EMAIL="seu_email@empresa.com"
MAIL_PASSWORD="senha_email"
```

#### **Para execução Docker - edite `.env.docker`:**
```env
# Banco de dados (Docker)
HOST=10.27.4.136        # Sem aspas para Docker
DB_USER=fecomercio       # Sem aspas
DB_NAME=cnc              # Sem aspas
PASSWORD=root            # Sem aspas

# ...resto igual ao .env
```

### 2. **Build da Imagem**
```powershell
# Build simples
docker build -t cnc-app .
```

### 3. **Executar Container**
```powershell
# Execução básica (agora usa .env.docker automaticamente)
docker run -d \
  --name cnc-sistema \
  --env-file .env.docker \
  -v ${PWD}/logs:/app/logs \
  -v ${PWD}/temp:/app/temp \
  -v ${USERPROFILE}/AppData/Local/ms-playwright:/ms-playwright:ro \
  cnc-app
```

## 🎛 Comandos Úteis

### **Ver Logs**
```powershell
docker logs cnc-sistema -f
```

### **Parar Container**
```powershell
docker stop cnc-sistema
```

### **Reiniciar Container**
```powershell
docker restart cnc-sistema
```

### **Remover Container**
```powershell
docker rm cnc-sistema
```

### **Executar Força (One-shot)**
```powershell
docker run --rm \
  --env-file .env \
  -v ${PWD}/logs:/app/logs \
  -v ${PWD}/temp:/app/temp \
  -v ${USERPROFILE}/AppData/Local/ms-playwright:/ms-playwright:ro \
  cnc-app npm run force
```

## 🚀 Scripts de Automação

### **Deploy Automatizado**

#### **Windows (PowerShell)**
```powershell
# Executar script de deploy
.\scripts\deploy.ps1
```

#### **Linux/Mac (Bash)**
```bash
# Tornar executável e executar
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

### **Utilitários de Gerenciamento**

#### **Windows (PowerShell)**
```powershell
# Ver todas as opções
.\scripts\utils.ps1 help

# Exemplos de uso
.\scripts\utils.ps1 logs      # Ver logs em tempo real
.\scripts\utils.ps1 restart   # Reiniciar container
.\scripts\utils.ps1 status    # Status e recursos
.\scripts\utils.ps1 force     # Execução forçada
.\scripts\utils.ps1 cleanup   # Limpar containers antigos
```

## 🔧 Configuração Avançada

### **Variáveis de Ambiente Importantes**
```env
# Timezone
TZ=America/Sao_Paulo

# Node.js
NODE_ENV=production
NODE_OPTIONS=--max-old-space-size=2048

# Playwright
PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
```

### **Volumes Necessários**
- `/app/logs` - Logs da aplicação
- `/app/temp` - Arquivos temporários
- `/ms-playwright` - Browsers do Playwright (somente leitura)

## 🚨 Troubleshooting

### **Container não inicia**
```powershell
# Ver logs de erro
docker logs cnc-sistema

# Verificar imagem
docker images cnc-app

# Rebuild limpo
docker build --no-cache -t cnc-app .
```

### **Erro de Playwright**
```powershell
# Verificar browsers no host
npx playwright install --dry-run

# Verificar path do volume
ls ${USERPROFILE}/AppData/Local/ms-playwright
```

### **Erro de conexão MySQL**
```powershell
# Testar conexão do container
docker run --rm cnc-app node -e "
const mysql = require('mysql2');
const conn = mysql.createConnection({
  host: process.env.HOST,
  user: process.env.DB_USER,
  password: process.env.PASSWORD
});
conn.connect(err => console.log(err ? 'ERRO' : 'OK'));
"
```

## 📈 Monitoramento

### **Status do Container**
```powershell
# Status geral
docker ps -f name=cnc-sistema

# Uso de recursos
docker stats cnc-sistema --no-stream

# Logs em tempo real
docker logs cnc-sistema -f --tail 50
```

### **Backup de Logs**
```powershell
# Backup automático
$date = Get-Date -Format "yyyyMMdd_HHmmss"
Copy-Item "logs" "backup_logs_$date" -Recurse
```

## 🎯 Exemplo Completo

```powershell
# 1. Preparar ambiente
npm install -g playwright
npx playwright install

# 2. Configurar .env (editar conforme necessário)
Copy-Item .env.example .env

# 3. Deploy automatizado
.\scripts\deploy.ps1

# 4. Gerenciar container
.\scripts\utils.ps1 logs     # Ver logs
.\scripts\utils.ps1 status   # Verificar status
```

### **Ou Deploy Manual**
```powershell
# Build e Deploy manual
docker build -t cnc-app .
docker run -d \
  --name cnc-sistema \
  --env-file .env \
  --restart unless-stopped \
  -v ${PWD}/logs:/app/logs \
  -v ${PWD}/temp:/app/temp \
  -v ${USERPROFILE}/AppData/Local/ms-playwright:/ms-playwright:ro \
  cnc-app

# Verificar
docker logs cnc-sistema -f
```

## 💡 Dicas de Otimização

- ✅ **Use `--restart unless-stopped`** para reinício automático
- ✅ **Monte logs como volume** para persistência
- ✅ **Playwright somente leitura** para segurança
- ✅ **Monitore recursos** com `docker stats`
- ✅ **Faça backup dos logs** regularmente

---

**🎯 Resumo**: Container único, simples e eficiente para o sistema CNC!