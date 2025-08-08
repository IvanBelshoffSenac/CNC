# Sistema Automático de Coleta de Dados CNC

Este projeto é um sistema automatizado para coleta, processamento e armazenamento de dados de pesquisas econômicas da Confederação Nacional do Comércio (CNC), incluindo ICEC, ICF e PEIC.

## 📋 Índice

- [Sobre o Projeto](#sobre-o-projeto)
- [Funcionalidades](#funcionalidades)
- [Tecnologias Utilizadas](#tecnologias-utilizadas)
- [Pré-requisitos](#pré-requisitos)
- [Instalação](#instalação)
- [Configuração](#configuração)
- [Execução](#execução)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Scripts Disponíveis](#scripts-disponíveis)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Como Funciona](#como-funciona)
- [Troubleshooting](#troubleshooting)

## 🎯 Sobre o Projeto

O Sistema CNC automatiza a coleta de dados das seguintes pesquisas:

- **ICEC** (Índice de Confiança do Empresário do Comércio)
- **ICF** (Índice de Confiança do Consumidor)
- **PEIC** (Pesquisa de Endividamento e Inadimplência do Consumidor)

O sistema utiliza duas abordagens para obtenção dos dados:
1. **Download direto** de planilhas Excel via API
2. **Web scraping** como método alternativo quando o download falha

## ⚡ Funcionalidades

- ✅ Coleta automatizada de dados históricos (Janeiro/2010 até presente)
- ✅ Agendamento automático via CRON (execução no dia 1 de cada mês)
- ✅ Dupla estratégia: Download de planilhas + Web scraping
- ✅ Processamento para múltiplas regiões (BR, ES, etc.)
- ✅ Armazenamento em banco de dados MySQL
- ✅ Sistema de notificações por email
- ✅ Logs detalhados e monitoramento
- ✅ Limpeza automática de arquivos temporários
- ✅ Relatórios de execução completos

## 🛠 Tecnologias Utilizadas

- **Node.js** - Runtime JavaScript
- **TypeScript** - Linguagem principal
- **TypeORM** - ORM para banco de dados
- **MySQL** - Banco de dados
- **Playwright** - Automação web (web scraping)
- **node-cron** - Agendamento de tarefas
- **Nodemailer** - Envio de emails
- **Axios** - Cliente HTTP
- **XLSX** - Processamento de planilhas Excel

## 📋 Pré-requisitos

- **Node.js** 16 ou superior
- **MySQL** 8.0 ou superior
- **NPM** ou **Yarn**
- Sistema operacional: Windows, macOS ou Linux

## 🚀 Instalação

### 1. Clone o Repositório

```bash
git clone <url-do-repositorio>
cd CNC
```

### 2. Instale as Dependências

```bash
npm install
```

### 3. Instale o Playwright (Obrigatório)

**⚠️ ATENÇÃO:** O Playwright requer instalação adicional de browsers. Execute:

```bash
npx playwright install
```

Este comando baixa os browsers necessários (Chromium, Firefox, WebKit) para o web scraping.

### 4. Configure o Banco de Dados

Crie um banco de dados MySQL:

```sql
CREATE DATABASE cnc;
CREATE USER 'fecomercio'@'localhost' IDENTIFIED BY 'root';
GRANT ALL PRIVILEGES ON cnc.* TO 'fecomercio'@'localhost';
FLUSH PRIVILEGES;
```

## ⚙️ Configuração

### 1. Arquivo de Ambiente

Crie um arquivo `.env` na raiz do projeto com as seguintes configurações:

```env
# Definição do Ambiente
NODE_ENV=development

# Configurações do Banco de Dados
HOST="localhost"
DB_USER="fecomercio"
DB_NAME="cnc"
DB_PORT=3306
PASSWORD="root"

# Configurações do web scraping
CREDENTIALS_USER="economia@fecomercio-es.com.br"
CREDENTIALS_PASSWORD="FecomercioES2023**"

# URL Base da API
BASE_URL=https://backend.pesquisascnc.com.br/admin/4/upload

# URLs Site
BASE_URL_SITE_ICEC=https://pesquisascnc.com.br/pesquisa-icec/ 
BASE_URL_SITE_ICF=https://pesquisascnc.com.br/pesquisa-icf/ 
BASE_URL_SITE_PEIC=https://pesquisascnc.com.br/pesquisa-peic/

# Configurações de Email
EXCHANGE_HOST=smtp.office365.com
EXCHANGE_PORT=587
MAIL_USERNAME=no-reply@es.senac.br
MAIL_PASSWORD=gHak8t%0Ad

# Configurações de Períodos
PERIOD_ICEC=01/2010:-1M
PERIOD_ICF=01/2010:-2M
PERIOD_PEIC=01/2010:-1M

# Configurações de Regiões
REGIONS_ICEC="BR,ES"
REGIONS_ICF="BR,ES"
REGIONS_PEIC="BR,ES"
```

### 2. Execute as Migrações

```bash
npm run migration:run
```

## 🏃‍♂️ Execução

### Execução em Desenvolvimento

```bash
npm run dev
```

### Execução em Produção

```bash
npm run build
npm start
```

### Execução Forçada (Sem Agendamento)

```bash
npm run force
```

## 📝 Variáveis de Ambiente

### Configurações Básicas

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `NODE_ENV` | Ambiente de execução | `development` |
| `HOST` | Host do banco de dados | `localhost` |
| `DB_USER` | Usuário do banco | `fecomercio` |
| `DB_NAME` | Nome do banco | `cnc` |
| `DB_PORT` | Porta do banco | `3306` |
| `PASSWORD` | Senha do banco | `root` |

### Configurações de Web Scraping

| Variável | Descrição |
|----------|-----------|
| `CREDENTIALS_USER` | Email para login no site CNC |
| `CREDENTIALS_PASSWORD` | Senha para login no site CNC |
| `BASE_URL` | URL base da API para download |
| `BASE_URL_SITE_ICEC` | URL do site ICEC |
| `BASE_URL_SITE_ICF` | URL do site ICF |
| `BASE_URL_SITE_PEIC` | URL do site PEIC |

### Configurações Especiais - Períodos

As configurações de período definem o intervalo de coleta para cada pesquisa:

```env
PERIOD_ICEC=01/2010:-1M
PERIOD_ICF=01/2010:-2M
PERIOD_PEIC=01/2010:-1M
```

**Formato:** `MM/YYYY:OFFSET`

- **`01/2010`**: Data de início (Janeiro de 2010)
- **`-1M`**: Offset do mês atual
  - `-1M` = mês anterior ao atual
  - `-2M` = dois meses anteriores ao atual
  - `0M` = mês atual

**Por que diferentes offsets?**
- **ICEC (-1M)**: Dados disponíveis no mês seguinte
- **ICF (-2M)**: Dados disponíveis com 2 meses de atraso
- **PEIC (-1M)**: Dados disponíveis no mês seguinte

### Configurações Especiais - Regiões

```env
REGIONS_ICEC="BR,ES"
REGIONS_ICF="BR,ES"
REGIONS_PEIC="BR,ES"
```

**Códigos de Região:**
- **`BR`**: Brasil (dados nacionais)
- **`ES`**: Espírito Santo
- **`RJ`**: Rio de Janeiro
- **`SP`**: São Paulo
- *(Outros códigos UF conforme disponibilidade)*

**Exemplo para múltiplas regiões:**
```env
REGIONS_ICEC="BR,ES,RJ,SP"
```

### Configurações de Email

| Variável | Descrição |
|----------|-----------|
| `EXCHANGE_HOST` | Servidor SMTP |
| `EXCHANGE_PORT` | Porta SMTP |
| `MAIL_USERNAME` | Email remetente |
| `MAIL_PASSWORD` | Senha do email |

## 📜 Scripts Disponíveis

| Script | Descrição |
|--------|-----------|
| `npm start` | Executa a aplicação em produção |
| `npm run dev` | Executa em modo desenvolvimento |
| `npm run build` | Compila TypeScript para JavaScript |
| `npm run force` | Execução forçada sem agendamento |
| `npm run migration:generate` | Gera nova migração |
| `npm run migration:run` | Executa migrações |
| `npm run migration:revert` | Reverte última migração |
| `npm run test:notification` | Testa sistema de notificações |

## 📁 Estrutura do Projeto

```
CNC/
├── src/
│   ├── server/
│   │   ├── database/
│   │   │   ├── data-source.ts      # Configuração TypeORM
│   │   │   ├── entities/           # Entidades do banco
│   │   │   ├── migrations/         # Migrações
│   │   │   └── repositories/       # Repositórios
│   │   ├── scheduler/
│   │   │   └── orchestrator.ts     # Agendador CRON
│   │   ├── services/
│   │   │   ├── icec.ts            # Serviço ICEC
│   │   │   ├── icf.ts             # Serviço ICF
│   │   │   ├── peic.ts            # Serviço PEIC
│   │   │   └── notification.ts    # Serviço de notificações
│   │   ├── shared/
│   │   │   ├── interfaces.ts      # Interfaces TypeScript
│   │   │   └── utils.ts           # Utilitários
│   │   └── tests/                 # Testes e scripts
│   ├── index.ts                   # Arquivo principal
│   └── force.ts                   # Execução forçada
├── build/                         # Arquivos compilados
├── temp/                          # Arquivos temporários
├── package.json
├── tsconfig.json
└── .env                          # Variáveis de ambiente
```

## 🔄 Como Funciona

### 1. Agendamento Automático

O sistema executa automaticamente:
- **ICEC**: Todo dia 1 às 02:00
- **ICF**: Todo dia 1 às 05:00
- **PEIC**: Todo dia 1 às 08:00

### 2. Processo de Coleta

Para cada pesquisa:

1. **Limpeza do banco** de dados da pesquisa
2. **Primeira tentativa**: Download direto das planilhas
3. **Segunda tentativa**: Web scraping para períodos com falha
4. **Processamento** dos dados extraídos
5. **Armazenamento** no banco de dados
6. **Envio de relatório** por email

### 3. Métodos de Coleta

#### Download Direto (Método Preferencial)
- URL: `https://backend.pesquisascnc.com.br/admin/4/upload/{MES}_{ANO}/{PESQUISA}/{REGIAO}.xls`
- Exemplo: `/1_2024/ICEC/BR.xls`

#### Web Scraping (Método Alternativo)
- Utiliza Playwright para automação do browser
- Login automático no site da CNC
- Navegação e extração de dados das tabelas
- Usado quando o download direto falha

### 4. Estrutura dos Dados

Cada pesquisa armazena:
- **Período**: Mês e ano
- **Região**: Código da região (BR, ES, etc.)
- **Método**: PLA (Planilha) ou WS (Web Scraping)
- **Dados específicos** de cada pesquisa

## 🚨 Troubleshooting

### Problemas Comuns

#### 1. Erro: "Playwright browsers not installed"
```bash
npx playwright install
```

#### 2. Erro de conexão com banco de dados
- Verifique se o MySQL está rodando
- Confirme as credenciais no `.env`
- Execute as migrações: `npm run migration:run`

#### 3. Falhas no web scraping
- Verifique as credenciais `CREDENTIALS_USER` e `CREDENTIALS_PASSWORD`
- Sites podem estar temporariamente indisponíveis
- O sistema tentará novamente na próxima execução

#### 4. Emails não são enviados
- Verifique configurações SMTP no `.env`
- Teste com: `npm run test:notification`

### Logs e Monitoramento

O sistema gera logs detalhados:
- ✅ Sucessos em verde
- ❌ Erros em vermelho
- 🔄 Processamento em andamento
- 📊 Estatísticas de execução

### Verificação de Funcionamento

1. **Teste individual de serviços**: Execute scripts de teste em `src/server/tests/`
2. **Monitoramento de dados**: Verifique tabelas no banco após execução
3. **Emails de relatório**: Confirme recebimento dos relatórios automáticos

## 📊 Dados Coletados

### ICEC (Índice de Confiança do Empresário do Comércio)
- ICEC Geral
- Até 50 funcionários
- Mais de 50 funcionários
- Semiduráveis
- Não duráveis
- Duráveis

### ICF (Índice de Confiança do Consumidor)
- NC (Nacional Comércio) - Pontos e Percentual
- Até 10 SM (Salários Mínimos) - Pontos e Percentual
- Mais de 10 SM - Pontos e Percentual

### PEIC (Pesquisa de Endividamento e Inadimplência)
- Endividados - Percentual e Absoluto
- Contas em atraso - Percentual e Absoluto
- Não terão condições de pagar - Percentual e Absoluto

---

## 📞 Suporte

Para dúvidas ou problemas:

1. Verifique os logs da aplicação
2. Consulte este README
3. Execute os scripts de teste
4. Entre em contato com o time de desenvolvimento

---

**Desenvolvido para Fecomercio-ES | Sistema CNC de Coleta Automática de Dados**
