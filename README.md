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

Copie o arquivo `.env.example` para `.env` e configure as variáveis:

```bash
cp .env.example .env
```

Edite o arquivo `.env` com suas configurações específicas:

```env
# Definição do Ambiente
NODE_ENV=development

# Configurações do Banco de Dados
HOST="localhost"
DB_USER="seu_usuario_mysql"
DB_NAME="cnc"
DB_PORT=3306
PASSWORD="sua_senha_mysql"

# Configurações do web scraping
CREDENTIALS_USER="seu_email@dominio.com"
CREDENTIALS_PASSWORD="sua_senha_cnc"

# URL Base da API
BASE_URL=https://backend.pesquisascnc.com.br/admin/4/upload

# URLs Site
BASE_URL_SITE_ICEC=https://pesquisascnc.com.br/pesquisa-icec/ 
BASE_URL_SITE_ICF=https://pesquisascnc.com.br/pesquisa-icf/ 
BASE_URL_SITE_PEIC=https://pesquisascnc.com.br/pesquisa-peic/

# Configurações de Email
EXCHANGE_HOST=smtp.office365.com
EXCHANGE_PORT=587
MAIL_USERNAME=seu_email_notificacao@dominio.com
MAIL_PASSWORD=sua_senha_email

# Configurações de Períodos
PERIOD_ICEC=01/2010:-1M
PERIOD_ICF=01/2010:-2M
PERIOD_PEIC=01/2010:-1M

# Configurações de Regiões
REGIONS_ICEC="BR,ES"
REGIONS_ICF="BR,ES"
REGIONS_PEIC="BR,ES"
```

> ⚠️ **Importante**: Nunca commite o arquivo `.env` com credenciais reais no repositório. Use sempre o `.env.example` como template.

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

**Formato:** `MM/YYYY:OFFSET_OU_DATA_FIM`

- **`01/2010`**: Data de início (Janeiro de 2010)
- **`OFFSET`**: Configurações baseadas no mês atual
  - `>` = mês atual
  - `-1M` = mês anterior ao atual
  - `-2M` = dois meses anteriores ao atual
  - `0M` = mesmo que `>` (mês atual)
- **`DATA_FIM`**: Data específica de fim (formato MM/YYYY)
  - Exemplo: `05/2025` = até maio de 2025

**Exemplos de configuração:**
```env
# Coleta até mês anterior
PERIOD_ICEC=01/2010:-1M

# Coleta até mês atual
PERIOD_ICEC=01/2010:>

# Coleta até data específica
PERIOD_ICEC=01/2010:12/2024
```

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

### 3. Detalhamento dos Métodos de Coleta

## 📊 Como Cada Serviço Coleta os Dados

### 🔍 ICEC (Índice de Confiança do Empresário do Comércio)

#### Método 1: Download Direto de Planilha
1. **URL construída**: `{BASE_URL}/{MES}_{ANO}/ICEC/{REGIAO}.xls`
   - Exemplo: `https://backend.pesquisascnc.com.br/admin/4/upload/7_2024/ICEC/BR.xls`
2. **Download via Axios**: Arquivo Excel baixado para pasta temporária
3. **Processamento Excel**: 
   - Lê primeira aba da planilha
   - Busca linha com "Índice (em Pontos)" (última linha do ICEC)
   - Extrai 6 valores numéricos: ICEC Geral, Até 50, Mais de 50, Semiduráveis, Não Duráveis, Duráveis
4. **Validação**: Verifica se todos os valores são numéricos válidos
5. **Armazenamento**: Salva no banco com método "PLA" (Planilha)

#### Método 2: Web Scraping (Fallback)
1. **Login automático**: Acessa site ICEC com credenciais
2. **Navegação**:
   - Seleciona ano no dropdown `#selectAno`
   - Seleciona mês no dropdown `#selectMes`
   - Seleciona região no dropdown `#selectEstado`
   - Clica em "Filtrar"
3. **Extração de dados**:
   - Aguarda carregamento da tabela no iframe `#dadosPesquisa`
   - Busca período target (formato "JUL 25")
   - Extrai valores da linha correspondente
4. **Processamento**: Converte vírgulas para pontos (formato brasileiro → padrão)
5. **Armazenamento**: Salva no banco com método "WS" (Web Scraping)

### 📈 ICF (Índice de Confiança do Consumidor)

#### Método 1: Download Direto de Planilha (Processo Complexo)

**⚠️ Diferencial ICF**: Requer download de **duas planilhas separadas** e cálculo matemático.

1. **Download de duas planilhas**:
   - **Planilha atual**: `{BASE_URL}/{MES}_{ANO}/ICF/{REGIAO}.xls`
   - **Planilha anterior**: `{BASE_URL}/{MES_ANTERIOR}_{ANO_ANTERIOR}/ICF/{REGIAO}.xls`
   - **Exemplo**: Para março/2024 → baixa `3_2024` e `2_2024`

2. **Extração de dados**:
   - **Planilha atual**: Extrai valores em pontos (NC, Até 10 SM, Mais de 10 SM)
   - **Planilha anterior**: Extrai valores em pontos do período anterior
   - **Busca seção**: "Índice (em Pontos)" em ambas as planilhas

3. **Cálculo de variação percentual**:
   ```
   Percentual = ((Valor_Atual - Valor_Anterior) / Valor_Anterior) × 100
   ```
   **Exemplo prático**:
   ```
   NC atual: 135,8 pontos
   NC anterior: 134,5 pontos
   NC percentual = ((135,8 - 134,5) / 134,5) × 100 = 0,97%
   ```

4. **Validação rigorosa**:
   - **Ambas as planilhas** devem ser baixadas com sucesso
   - **Se uma falhar** → todo o período é marcado como erro
   - **Erro registrado** → será processado por web scraping

5. **Dados finais armazenados**:
   - **3 valores em pontos** (da planilha atual)
   - **3 valores percentuais** (calculados matematicamente)

#### Método 2: Web Scraping (Fallback - Sem Cálculo)

**✅ Vantagem**: Dados já vêm calculados pelo site da CNC.

1. **Login e navegação**: Similar ao ICEC, mas no site ICF
2. **Extração direta da tabela**:
   - Tabela contém **6 colunas**: 3 de pontos + 3 de percentuais **já calculados**
   - Formato: `MESES | NC | ATÉ 10 SM | + DE 10 SM | NC% | ATÉ 10 SM% | + DE 10 SM%`
   - Exemplo: `FEB 10 | 135,8 | 134,1 | 146,1 | 0,2 | 0,5 | -1,8`
3. **Processamento simples**: 
   - **Não há cálculo necessário** - valores já processados
   - Separa valores de pontos (colunas 1-3) dos percentuais (colunas 4-6)
   - Converte formato brasileiro para padrão internacional

**📊 Resumo das Diferenças ICF:**
| Aspecto | Método Planilha | Método Web Scraping |
|---------|----------------|-------------------|
| **Planilhas necessárias** | 2 (atual + anterior) | 0 (acesso direto ao site) |
| **Cálculo matemático** | ✅ Necessário | ❌ Não necessário |
| **Complexidade** | Alta | Baixa |
| **Ponto de falha** | Qualquer planilha indisponível | Instabilidade do site |
| **Dados obtidos** | Calculados localmente | Pré-calculados pelo CNC |

### 💳 PEIC (Pesquisa de Endividamento e Inadimplência)

#### Método 1: Download Direto de Planilha
1. **URL construída**: `{BASE_URL}/{MES}_{ANO}/PEIC/{REGIAO}.xls`
2. **Processamento específico**:
   - **Dados Percentuais**: Busca seção com valores em %
   - **Dados Absolutos**: Busca seção com milhões de pessoas
3. **Extração PEIC**:
   - **Endividados**: % e absoluto (milhões)
   - **Contas em atraso**: % e absoluto (milhões) 
   - **Não terão condições de pagar**: % e absoluto (milhões)
4. **Conversões**:
   - Percentuais: Remove % e converte para decimal
   - Absolutos: Converte texto "X,Y milhões" para número

#### Método 2: Web Scraping (Fallback)
1. **Login e navegação**: No site PEIC específico
2. **Extração tabular**:
   - Busca período target na tabela
   - Extrai 6 valores: 3 percentuais + 3 absolutos
   - Ordem: Endividados %, Atraso %, Sem condições %, Endividados abs, Atraso abs, Sem condições abs
3. **Processamento específico**:
   - **Percentuais**: Já vêm sem símbolo % (ex: "45,2")
   - **Absolutos**: Formato "45,2 milhões" → conversão para número

## 🔄 Fluxo de Fallback Inteligente

### Estratégia Dupla
1. **Primeira Passada**: Tenta download direto para todos os períodos
2. **Lista de Erros**: Coleta períodos que falharam
3. **Segunda Passada**: Web scraping apenas para os períodos com falha
4. **Otimização**: Reutiliza sessão do browser para múltiplos períodos

### Tratamento de Erros
- **Timeout**: Aguarda carregamento de elementos dinâmicos
- **Elementos não encontrados**: Logs detalhados para debugging
- **Dados inválidos**: Validação antes do armazenamento
- **Cleanup automático**: Remove arquivos temporários ao final

### 4. Estrutura dos Dados

Cada pesquisa armazena:
- **Período**: Mês e ano
- **Região**: Código da região (BR, ES, etc.)
- **Método**: PLA (Planilha) ou WS (Web Scraping)
- **Dados específicos** de cada pesquisa

## 📊 Dados Coletados por Pesquisa

### 🔍 ICEC (Tabela: `icec`)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `ICEC` | DECIMAL(5,1) | Índice Geral de Confiança |
| `ATE_50` | DECIMAL(5,1) | Empresas até 50 funcionários |
| `MAIS_DE_50` | DECIMAL(5,1) | Empresas com mais de 50 funcionários |
| `SEMIDURAVEIS` | DECIMAL(5,1) | Bens semiduráveis |
| `NAO_DURAVEIS` | DECIMAL(5,1) | Bens não duráveis |
| `DURAVEIS` | DECIMAL(5,1) | Bens duráveis |
| `MES` | INT | Mês da pesquisa (1-12) |
| `ANO` | INT | Ano da pesquisa |
| `REGIAO` | VARCHAR(5) | Código da região (BR, ES, etc.) |
| `METODO` | ENUM | PLA (Planilha) ou WS (Web Scraping) |

**Exemplo de dados ICEC:**
```json
{
  "ICEC": 104.1,
  "ATE_50": 104.0,
  "MAIS_DE_50": 108.0,
  "SEMIDURAVEIS": 111.1,
  "NAO_DURAVEIS": 103.4,
  "DURAVEIS": 100.6,
  "MES": 7,
  "ANO": 2024,
  "REGIAO": "BR",
  "METODO": "PLA"
}
```

### 📈 ICF (Tabela: `icf`)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `NC_PONTOS` | DECIMAL(5,1) | Nacional Comércio em pontos |
| `ATE_10_SM_PONTOS` | DECIMAL(5,1) | Até 10 SM em pontos |
| `MAIS_DE_10_SM_PONTOS` | DECIMAL(5,1) | Mais de 10 SM em pontos |
| `NC_PERCENTUAL` | DECIMAL(5,1) | Nacional Comércio variação % |
| `ATE_10_SM_PERCENTUAL` | DECIMAL(5,1) | Até 10 SM variação % |
| `MAIS_DE_10_SM_PERCENTUAL` | DECIMAL(5,1) | Mais de 10 SM variação % |
| `MES` | INT | Mês da pesquisa |
| `ANO` | INT | Ano da pesquisa |
| `REGIAO` | VARCHAR(5) | Código da região |
| `METODO` | ENUM | PLA ou WS |

**Exemplo de dados ICF:**
```json
{
  "NC_PONTOS": 135.8,
  "ATE_10_SM_PONTOS": 134.1,
  "MAIS_DE_10_SM_PONTOS": 146.1,
  "NC_PERCENTUAL": 0.2,
  "ATE_10_SM_PERCENTUAL": 0.5,
  "MAIS_DE_10_SM_PERCENTUAL": -1.8,
  "MES": 2,
  "ANO": 2024,
  "REGIAO": "BR",
  "METODO": "WS"
}
```

### 💳 PEIC (Tabela: `peic`)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `ENDIVIDADOS_PERCENTUAL` | DECIMAL(5,1) | % de famílias endividadas |
| `CONTAS_EM_ATRASO_PERCENTUAL` | DECIMAL(5,1) | % com contas em atraso |
| `NAO_TERAO_CONDICOES_DE_PAGAR_PERCENTUAL` | DECIMAL(5,1) | % sem condições de pagar |
| `ENDIVIDADOS_ABSOLUTO` | DECIMAL(5,1) | Milhões de famílias endividadas |
| `CONTAS_EM_ATRASO_ABSOLUTO` | DECIMAL(5,1) | Milhões com contas em atraso |
| `NAO_TERAO_CONDICOES_DE_PAGAR_ABSOLUTO` | DECIMAL(5,1) | Milhões sem condições |
| `MES` | INT | Mês da pesquisa |
| `ANO` | INT | Ano da pesquisa |
| `REGIAO` | VARCHAR(5) | Código da região |
| `METODO` | ENUM | PLA ou WS |

**Exemplo de dados PEIC:**
```json
{
  "ENDIVIDADOS_PERCENTUAL": 78.5,
  "CONTAS_EM_ATRASO_PERCENTUAL": 28.3,
  "NAO_TERAO_CONDICOES_DE_PAGAR_PERCENTUAL": 11.1,
  "ENDIVIDADOS_ABSOLUTO": 54.2,
  "CONTAS_EM_ATRASO_ABSOLUTO": 19.5,
  "NAO_TERAO_CONDICOES_DE_PAGAR_ABSOLUTO": 7.7,
  "MES": 7,
  "ANO": 2024,
  "REGIAO": "ES",
  "METODO": "PLA"
}
```

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
