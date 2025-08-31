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
- ✅ Agendamento automático via CRON (configurável via variáveis de ambiente)
- ✅ **Controle granular de execução** (habilitar/desabilitar serviços individualmente)
- ✅ Dupla estratégia: Download de planilhas + Web scraping
- ✅ Processamento para múltiplas regiões (BR, ES, etc.)
- ✅ Armazenamento em banco de dados MySQL
- ✅ **Extração e armazenamento de metadados completos** das planilhas
- ✅ **Processamento inteligente de dados estruturados** de cada pesquisa
- ✅ **Relacionamento entre dados principais e metadados** via foreign keys
- ✅ Sistema de notificações por email com próxima execução agendada
- ✅ Logs detalhados e monitoramento
- ✅ Limpeza automática de arquivos temporários
- ✅ Relatórios de execução completos
- ✅ **Validação e processamento otimizado** de múltiplos formatos de dados
- ✅ **Proteção contra execuções desnecessárias** quando todos os serviços estão desabilitados

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

# Configurações de Agendamento (CRON)
SCHEDULE_ICEC="0 2 1 * *"
SCHEDULE_ICF="0 5 1 * *"
SCHEDULE_PEIC="0 8 1 * *"

# Múltiplos destinatários para notificações
NOTIFICATION_EMAIL="destinatario1@dominio.com, destinatario2@empresa.com"
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

### Configurações Especiais - Agendamento (Schedule)

O sistema permite configurar horários personalizados para execução automática de cada serviço através de expressões CRON:

```env
SCHEDULE_ICEC="0 2 1 * *"
SCHEDULE_ICF="0 5 1 * *"
SCHEDULE_PEIC="0 8 1 * *"
```

**Formato CRON:** `"segundo minuto hora dia mês dia_da_semana"`

**Configurações Padrão:**
- **ICEC**: `"0 2 1 * *"` = Todo dia 1 do mês às 02:00
- **ICF**: `"0 5 1 * *"` = Todo dia 1 do mês às 05:00
- **PEIC**: `"0 8 1 * *"` = Todo dia 1 do mês às 08:00

**Exemplos de Configurações Personalizadas:**

```env
# Executar toda segunda-feira às 14:30
SCHEDULE_ICEC="0 30 14 * * 1"

# Executar todo dia 15 do mês às 16:45
SCHEDULE_ICF="0 45 16 15 * *"

# Executar a cada 6 horas
SCHEDULE_PEIC="0 0 */6 * *"

# Executar todo dia às 09:00
SCHEDULE_ICEC="0 0 9 * * *"

# Executar duas vezes por mês (dia 1 e 15)
SCHEDULE_ICF="0 0 10 1,15 * *"
```

**Referência CRON Rápida:**
| Campo | Valores | Exemplos |
|-------|---------|----------|
| Segundo | 0-59 | `0` = No segundo 0 |
| Minuto | 0-59 | `30` = No minuto 30 |
| Hora | 0-23 | `14` = Às 14h (2 PM) |
| Dia | 1-31 | `1` = Dia 1 do mês |
| Mês | 1-12 | `*` = Todos os meses |
| Dia da Semana | 0-7 | `1` = Segunda-feira |

**Caracteres Especiais:**
- `*` = Qualquer valor
- `*/n` = A cada n unidades (ex: `*/6` = a cada 6 horas)
- `n-m` = Intervalo (ex: `1-5` = segunda a sexta)
- `n,m` = Valores específicos (ex: `1,15` = dia 1 e 15)

**⚠️ Observações Importantes:**
- Se as variáveis **não forem configuradas**, o sistema usará os **valores padrão**
- As configurações são **aplicadas na inicialização** - reinicie a aplicação após mudanças
- Use **aspas duplas** ao definir as expressões CRON
- O sistema exibirá no console quais configurações estão sendo utilizadas (padrão ou customizadas)

### Configurações de Agendamento (Tabela de Referência)

| Variável | Descrição | Valor Padrão | Exemplo Personalizado |
|----------|-----------|--------------|----------------------|
| `SCHEDULE_ICEC` | Agendamento para coleta ICEC | `"0 2 1 * *"` | `"0 30 14 * * 1"` |
| `SCHEDULE_ICF` | Agendamento para coleta ICF | `"0 5 1 * *"` | `"0 45 16 15 * *"` |
| `SCHEDULE_PEIC` | Agendamento para coleta PEIC | `"0 8 1 * *"` | `"0 0 */6 * *"` |

### Configurações de Controle de Execução (Tabela de Referência)

| Variável | Descrição | Valor Padrão | Funcionalidade |
|----------|-----------|--------------|----------------|
| `ENABLED_ICEC` | Controla execução da coleta ICEC | `true` | Habilita/desabilita ICEC |
| `ENABLED_ICF` | Controla execução da coleta ICF | `true` | Habilita/desabilita ICF |
| `ENABLED_PEIC` | Controla execução da coleta PEIC | `true` | Habilita/desabilita PEIC |

**🎯 Comportamento do Sistema:**
- **Se `undefined`**: Considera como `true` (habilitado)
- **Se `true`**: Serviço é executado normalmente
- **Se `false`**: Serviço é ignorado em execuções automáticas e forçadas
- **Validação**: Se todos estiverem `false`, aplicação não executa

### Configurações de Email

| Variável | Descrição |
|----------|-----------|
| `EXCHANGE_HOST` | Servidor SMTP |
| `EXCHANGE_PORT` | Porta SMTP |
| `MAIL_USERNAME` | Email remetente |
| `MAIL_PASSWORD` | Senha do email |
| `NOTIFICATION_EMAIL` | Email(s) destinatário(s) - suporte a múltiplos separados por vírgula |

### Configurações de Controle de Execução

| Variável | Descrição | Valores | Padrão |
|----------|-----------|---------|--------|
| `ENABLED_ICEC` | Habilita/desabilita coleta ICEC | `true` ou `false` | `true` |
| `ENABLED_ICF` | Habilita/desabilita coleta ICF | `true` ou `false` | `true` |
| `ENABLED_PEIC` | Habilita/desabilita coleta PEIC | `true` ou `false` | `true` |

**🎯 Funcionalidades do Controle de Execução:**
- **Desabilitação granular**: Controle individual de cada pesquisa
- **Agendamentos dinâmicos**: Apenas serviços habilitados são agendados
- **Execução forçada respeitada**: `npm run force` também obedece essas configurações
- **Logs informativos**: Sistema exibe quais serviços estão habilitados/desabilitados
- **Proteção contra execução vazia**: Se todos estiverem desabilitados, aplicação não executa

**Exemplo de configuração seletiva:**
```env
# Coletar apenas ICEC e PEIC (desabilitar ICF)
ENABLED_ICEC=true
ENABLED_ICF=false
ENABLED_PEIC=true
```

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

## 📁 Estrutura do Projeto

```
CNC/
├── src/
│   ├── server/
│   │   ├── database/
│   │   │   ├── data-source.ts      # Configuração TypeORM
│   │   │   ├── entities/           # Entidades do banco
│   │   │   │   ├── Icec.ts         # Entidade principal ICEC
│   │   │   │   ├── Icf.ts          # Entidade principal ICF
│   │   │   │   ├── Peic.ts         # Entidade principal PEIC
│   │   │   │   ├── MetadadosIcec.ts # Metadados detalhados ICEC
│   │   │   │   ├── MetadadosIcf.ts  # Metadados detalhados ICF
│   │   │   │   └── MetadadosPeic.ts # Metadados detalhados PEIC
│   │   │   ├── migrations/         # Migrações do banco
│   │   │   └── repositories/       # Repositórios de dados
│   │   │       ├── icecRepository.ts
│   │   │       ├── icfRepository.ts
│   │   │       ├── peicRepository.ts
│   │   │       ├── metadadosIcecRepository.ts
│   │   │       ├── metadadosIcfRepository.ts
│   │   │       └── metadadosPeicRepository.ts
│   │   ├── scheduler/
│   │   │   └── orchestrator.ts     # Agendador CRON
│   │   ├── services/
│   │   │   ├── icec.ts            # Serviço ICEC com extração de metadados
│   │   │   ├── icf.ts             # Serviço ICF com extração de metadados
│   │   │   ├── peic.ts            # Serviço PEIC com extração de metadados
│   │   │   └── notification.ts    # Serviço de notificações
│   │   ├── shared/
│   │   │   ├── interfaces.ts      # Interfaces TypeScript
│   │   │   └── utils.ts           # Utilitários e transformadores de dados
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

O sistema executa automaticamente conforme configurações CRON definidas:

**Configurações Padrão:**
- **ICEC**: Todo dia 1 às 02:00 (`"0 2 1 * *"`)
- **ICF**: Todo dia 1 às 05:00 (`"0 5 1 * *"`)
- **PEIC**: Todo dia 1 às 08:00 (`"0 8 1 * *"`)

**Configurações Personalizáveis:**
- Use as variáveis `SCHEDULE_ICEC`, `SCHEDULE_ICF`, `SCHEDULE_PEIC` no `.env`
- Formato CRON: `"segundo minuto hora dia mês dia_da_semana"`
- Exemplos: `"0 30 14 * * 1"` (toda segunda às 14:30), `"0 0 */6 * *"` (a cada 6 horas)

**🎯 Controle de Execução:**
- **Habilitar/Desabilitar**: Use `ENABLED_ICEC`, `ENABLED_ICF`, `ENABLED_PEIC` no `.env`
- **Execução seletiva**: Apenas serviços habilitados (`true`) são executados
- **Agendamentos inteligentes**: Serviços desabilitados não são agendados
- **Proteção de execução vazia**: Se todos estiverem desabilitados, aplicação não executa

**Logs de Inicialização:**
```
⚡ Configurações de agendamento:
   • ICEC: 0 2 1 * * (padrão) - ✅ Habilitado
   • ICF:  0 30 14 * * 1 (customizado) - ❌ Desabilitado
   • PEIC: 0 0 */6 * * (customizado) - ✅ Habilitado
```

### 2. Processo de Coleta

Para cada pesquisa:

1. **Limpeza do banco** de dados da pesquisa
2. **Primeira tentativa**: Download direto das planilhas
3. **Segunda tentativa**: Web scraping para períodos com falha
4. **Processamento** dos dados extraídos para tabelas principais
5. **Extração de metadados** automática das planilhas (apenas para método Planilha)
6. **Armazenamento** no banco de dados (dados principais + metadados)
7. **Envio de relatório** por email com informações detalhadas:
   - Estatísticas de execução (sucessos, falhas, tempo)
   - Dados por região e método de coleta
   - **📅 Próxima execução agendada** calculada automaticamente
   - Taxa de sucesso e recomendações

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
4. **Extração de Metadados Automática**:
   - **Processamento completo da planilha** usando `transformJsonToICEC()`
   - **Identificação automática** de todos os tipos de índices e campos
   - **Extração estruturada** de expectativas, situação atual e índices finais
   - **Preservação de dados brutos** para todos os subíndices e categorias
5. **Validação**: Verifica se todos os valores são numéricos válidos
6. **Armazenamento**: 
   - Salva dados principais no banco com método "PLA" (Planilha)
   - **Salva metadados detalhados** na tabela `metadados_icec` com relacionamento
7. **Otimização**: 
   - **Processamento em lote** de metadados para alta performance
   - **Verificação de duplicação** para evitar reprocessamento

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
5. **Armazenamento**: 
   - Salva no banco com método "WS" (Web Scraping)
   - **⚠️ Metadados não disponíveis** para registros obtidos via web scraping

**📊 Diferenças nos Metadados ICEC:**
| Método | Metadados Disponíveis | Detalhes |
|--------|--------------------|----------|
| **Planilha (PLA)** | ✅ Completos | Todos os subíndices, expectativas e situação atual |
| **Web Scraping (WS)** | ❌ Indisponíveis | Apenas valores principais dos índices |

### 📈 ICF (Índice de Confiança do Consumidor)

#### Método 1: Download Direto de Planilha (Processo Simplificado)

1. **Download de uma planilha**:
   - **Planilha única**: `{BASE_URL}/{MES}_{ANO}/ICF/{REGIAO}.xls`
   - **Exemplo**: Para março/2024 → baixa apenas `3_2024/ICF/BR.xls`

2. **Extração de dados estruturada**:
   - **Linha "Índice (Em Pontos)"**: Extrai valores em pontos (NC, Até 10 SM, Mais de 10 SM)
   - **Linha "Índice (Variação Mensal)"**: Extrai percentuais **já calculados** pela CNC
   - **Processamento direto**: Não há necessidade de cálculos adicionais

3. **Estrutura da planilha otimizada**:
   ```
   Índice (Em Pontos)       | 135,8 | 134,1 | 146,1
   Índice (Variação Mensal) |  0,2  |  0,5  | -1,8
   ```

4. **Extração de Metadados Avançada**:
   - **Processamento completo** usando `transformJsonToICF()`
   - **Todos os tipos de dados** por categoria e faixa salarial
   - **Estruturação automática** de expectativas e situação atual
   - **Preservação de dados originais** da CNC

5. **Validação simplificada**:
   - **Uma única planilha** deve ser baixada com sucesso
   - **Se falhar** → período é processado por web scraping
   - **Dados mais confiáveis** diretamente da fonte oficial

6. **Dados finais armazenados**:
   - **3 valores em pontos** (linha "Índice Em Pontos")
   - **3 valores percentuais** (linha "Variação Mensal" - pré-calculados)
   - **Metadados completos** vinculados ao registro principal

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

**📊 Características ICF:**
| Aspecto | Método Planilha | Método Web Scraping |
|---------|----------------|-------------------|
| **Arquivos processados** | 1 planilha Excel | Dados direto do site |
| **Processamento** | Leitura direta dos valores | Extração da tabela web |
| **Dados obtidos** | Pré-calculados pela CNC | Pré-calculados pela CNC |
| **Metadados** | ✅ Completos | ❌ Indisponíveis |
| **Confiabilidade** | Alta (fonte oficial) | Alta (mesmo site CNC) |
| **Dependência** | Disponibilidade da planilha | Estabilidade do site |

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
4. **Extração de Metadados Completa**:
   - **Processamento avançado** usando `transformJsonToPEIC()`
   - **Todos os tipos de endividamento** por categoria
   - **Dados detalhados** por faixa salarial e região
   - **Números absolutos** e percentuais estruturados
5. **Conversões**:
   - Percentuais: Remove % e converte para decimal
   - Absolutos: Converte texto "X,Y milhões" para número
6. **Armazenamento**:
   - Dados principais na tabela `peics`
   - **Metadados detalhados** na tabela `metadados_peic`

#### Método 2: Web Scraping (Fallback)
1. **Login e navegação**: No site PEIC específico
2. **Extração tabular**:
   - Busca período target na tabela
   - Extrai 6 valores: 3 percentuais + 3 absolutos
   - Ordem: Endividados %, Atraso %, Sem condições %, Endividados abs, Atraso abs, Sem condições abs
3. **Processamento específico**:
   - **Percentuais**: Já vêm sem símbolo % (ex: "45,2")
   - **Absolutos**: Formato "45,2 milhões" → conversão para número
4. **Armazenamento**:
   - Apenas dados principais (sem metadados detalhados)

**📊 Diferenças nos Metadados PEIC:**
| Método | Metadados Disponíveis | Detalhes |
|--------|--------------------|----------|
| **Planilha (PLA)** | ✅ Completos | Todas as categorias de endividamento e números absolutos |
| **Web Scraping (WS)** | ❌ Indisponíveis | Apenas valores principais dos indicadores |

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
- **Metadados detalhados** (quando coletados via planilha)

## 📊 Sistema de Metadados Avançado

O sistema implementa um mecanismo sofisticado de extração e armazenamento de metadados que captura **todos os dados estruturados** presentes nas planilhas oficiais da CNC, não apenas os valores principais dos índices.

### 🔍 Funcionalidades dos Metadados

#### ✅ Extração Automática Inteligente
- **Processamento completo** de todas as seções das planilhas Excel
- **Identificação automática** de tipos de índices e campos
- **Preservação da estrutura** original dos dados da CNC
- **Validação e formatação** adequada para armazenamento

#### ✅ Armazenamento Estruturado
- **Tabelas separadas** para metadados de cada pesquisa
- **Relacionamento direto** via foreign keys com dados principais
- **Dados brutos preservados** como strings para máxima fidelidade
- **Timestamps** de inserção para auditoria

#### ✅ Cobertura Completa de Dados
- **ICEC**: Todos os subíndices, categorias e valores detalhados
- **ICF**: Dados completos de pontos e percentuais por categoria
- **PEIC**: Informações detalhadas de endividamento e inadimplência

### 🗄️ Estrutura de Metadados por Pesquisa

#### 📊 ICEC - Metadados (Tabela: `metadados_icec`)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `TIPOINDICE` | TEXT | Tipo do índice (ex: "Índice de Confiança", "Expectativas") |
| `CAMPO` | TEXT | Campo específico (ex: "Índice (em Pontos)", "Situação Atual") |
| `TOTAL` | TEXT | Valor total/geral |
| `EMPRESAS_COM_ATÉ_50_EMPREGADOS` | TEXT | Dados para empresas pequenas |
| `EMPRESAS_COM_MAIS_DE_50_EMPREGADOS` | TEXT | Dados para empresas grandes |
| `SEMIDURAVEIS` | TEXT | Setor de bens semiduráveis |
| `NAO_DURAVEIS` | TEXT | Setor de bens não duráveis |
| `DURAVEIS` | TEXT | Setor de bens duráveis |
| `INDICE` | BOOLEAN | Se é um valor de índice principal |
| `icec_id` | UUID | Relacionamento com registro ICEC |

#### 📈 ICF - Metadados (Tabela: `metadados_icf`)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `TIPOINDICE` | TEXT | Tipo do índice ICF |
| `CAMPO` | TEXT | Campo específico do índice |
| `TOTAL` | TEXT | Valor total/nacional |
| `ATE_10_SM` | TEXT | Consumidores até 10 salários mínimos |
| `MAIS_DE_10_SM` | TEXT | Consumidores acima de 10 salários mínimos |
| `INDICE` | BOOLEAN | Se é um valor de índice principal |
| `icf_id` | UUID | Relacionamento com registro ICF |

#### 💳 PEIC - Metadados (Tabela: `metadados_peic`)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `TIPOINDICE` | TEXT | Tipo de indicador PEIC |
| `CAMPO` | TEXT | Campo específico do indicador |
| `TOTAL` | TEXT | Valor total/nacional |
| `ATE_10_SM` | TEXT | Famílias até 10 salários mínimos |
| `MAIS_DE_10_SM` | TEXT | Famílias acima de 10 salários mínimos |
| `NUMERO_ABSOLUTO` | TEXT | Valores absolutos em milhões |
| `peic_id` | UUID | Relacionamento com registro PEIC |

### 🔄 Processo de Extração de Metadados

#### 1. Identificação Automática
- **Localização de planilhas** já baixadas na pasta temporária
- **Verificação de existência** de metadados para evitar duplicação
- **Processamento inteligente** da estrutura da planilha

#### 2. Transformação de Dados
- **Funções especializadas**: `transformJsonToICEC()`, `transformJsonToICF()`, `transformJsonToPEIC()`
- **Parsing otimizado** de células Excel para estruturas tipadas
- **Validação de dados** antes do armazenamento

#### 3. Armazenamento Otimizado
- **Operações em lote** para alta performance
- **Verificação de integridade** referencial
- **Logs detalhados** do processo de extração

### 📋 Características Técnicas

#### ✅ Performance Otimizada
- **Processamento em lote** de múltiplos registros
- **Consultas otimizadas** para verificação de existência
- **Cleanup automático** de recursos temporários

#### ✅ Integridade de Dados
- **Foreign keys** garantem relacionamento consistente
- **Dados brutos preservados** como TEXT para flexibilidade
- **Cascade delete** para manutenção automática

#### ✅ Monitoramento Completo
- **Logs específicos** para cada etapa do processo
- **Contadores de sucessos** e falhas de metadados
- **Integração com relatórios** de execução por email

### 🎯 Casos de Uso dos Metadados

#### 📊 Análise Histórica Detalhada
- **Comparação temporal** de todos os subíndices
- **Análise de tendências** por categoria específica
- **Drill-down** em dados que não aparecem nos índices principais

#### 📈 Relatórios Avançados
- **Relatórios customizados** com dados granulares
- **Dashboards detalhados** para diferentes categorias
- **Exportação** de dados estruturados completos

#### 🔍 Auditoria e Compliance
- **Rastreabilidade completa** da origem dos dados
- **Validação** contra fontes oficiais
- **Histórico de modificações** e atualizações

## 📊 Dados Coletados por Pesquisa

### 🔍 ICEC (Tabela: `icecs`)
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
| `metadados` | OneToMany | Relacionamento com `metadados_icec` |

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
  "METODO": "PLA",
  "metadados": [] // Array com todos os metadados detalhados
}
```

### 📈 ICF (Tabela: `icfs`)
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
| `metadados` | OneToMany | Relacionamento com `metadados_icf` |

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
  "METODO": "WS",
  "metadados": [] // Array com todos os metadados detalhados
}
```

### 💳 PEIC (Tabela: `peics`)
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
| `metadados` | OneToMany | Relacionamento com `metadados_peic` |

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
  "METODO": "PLA",
  "metadados": [] // Array com todos os metadados detalhados
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
- Teste manualmente enviando um email de relatório

#### 5. Metadados não estão sendo processados
- **Metadados só são extraídos** para registros obtidos via planilha (método PLA)
- **Web scraping não gera metadados** - comportamento normal
- Verifique logs para mensagens: `"🔄 Iniciando processamento de metadados"`
- **Metadados existentes** não são reprocessados - evita duplicação
- Se necessário, limpe tabelas de metadados para reprocessar

#### 7. Sistema não executa nenhum serviço
- **Verifique as variáveis** `ENABLED_ICEC`, `ENABLED_ICF`, `ENABLED_PEIC` no `.env`
- **Pelo menos um serviço** deve estar configurado como `true`
- **Se todos estiverem `false`** → aplicação encerra automaticamente
- **Logs informativos**: Procure por `"❌ === TODOS OS SERVIÇOS ESTÃO DESABILITADOS ==="`

#### 8. Agendamentos não funcionam
- **Serviços desabilitados** não são agendados automaticamente
- **Verifique os logs** na inicialização para confirmar quais serviços estão habilitados
- **Configure adequadamente** as variáveis ENABLED_* no `.env`

### Logs e Monitoramento

O sistema gera logs detalhados:
- ✅ Sucessos em verde
- ❌ Erros em vermelho
- 🔄 Processamento em andamento
- 📊 Estatísticas de execução

### Verificação de Funcionamento

1. **Teste individual de serviços**: Execute scripts de teste em `src/server/tests/`
2. **Monitoramento de dados**: 
   - Verifique tabelas principais (`icecs`, `icfs`, `peics`) após execução
   - **Verifique tabelas de metadados** (`metadados_icec`, `metadados_icf`, `metadados_peic`)
   - **Validação de relacionamentos**: Confirme foreign keys entre tabelas principais e metadados
3. **Emails de relatório**: Confirme recebimento dos relatórios automáticos
4. **Logs de metadados**: Procure por mensagens específicas:
   - `"📊 Encontrados X registros do tipo Planilha"`
   - `"📥 Processando metadados para período..."`
   - `"✅ Metadados preparados para ID: X"`
   - `"📊 Total de metadados salvos: X"`

### Consultas SQL Úteis para Verificação

#### Verificar dados com metadados:
```sql
-- ICEC com metadados
SELECT i.*, COUNT(m.id) as total_metadados 
FROM icecs i 
LEFT JOIN metadados_icec m ON i.id = m.icec_id 
GROUP BY i.id;

-- ICF com metadados  
SELECT i.*, COUNT(m.id) as total_metadados 
FROM icfs i 
LEFT JOIN metadados_icf m ON i.id = m.icf_id 
GROUP BY i.id;

-- PEIC com metadados
SELECT p.*, COUNT(m.id) as total_metadados 
FROM peics p 
LEFT JOIN metadados_peic m ON p.id = m.peic_id 
GROUP BY p.id;
```

#### Verificar integridade dos relacionamentos:
```sql
-- Metadados órfãos (sem registro principal)
SELECT COUNT(*) FROM metadados_icec 
WHERE icec_id NOT IN (SELECT id FROM icecs);
```

## 📊 Dados Coletados

### ICEC (Índice de Confiança do Empresário do Comércio)
- **Dados Principais**:
  - ICEC Geral
  - Até 50 funcionários
  - Mais de 50 funcionários
  - Semiduráveis
  - Não duráveis
  - Duráveis
- **Metadados Detalhados** (via planilha):
  - Expectativas empresariais por categoria
  - Situação atual por setor
  - Índices detalhados por tamanho de empresa
  - Dados de confiança por tipo de bem comercializado

### ICF (Índice de Confiança do Consumidor)
- **Dados Principais**:
  - NC (Nacional Comércio) - Pontos e Percentual
  - Até 10 SM (Salários Mínimos) - Pontos e Percentual
  - Mais de 10 SM - Pontos e Percentual
- **Metadados Detalhados** (via planilha):
  - Índices de confiança por faixa de renda
  - Expectativas econômicas dos consumidores
  - Situação financeira atual por categoria
  - Variações históricas detalhadas

### PEIC (Pesquisa de Endividamento e Inadimplência)
- **Dados Principais**:
  - Endividados - Percentual e Absoluto
  - Contas em atraso - Percentual e Absoluto
  - Não terão condições de pagar - Percentual e Absoluto
- **Metadados Detalhados** (via planilha):
  - Endividamento por tipo de dívida
  - Inadimplência por faixa salarial
  - Perfil socioeconômico dos endividados
  - Números absolutos regionais detalhados

## 📧 Sistema de Notificações

### Funcionalidades dos Emails de Relatório

O sistema envia automaticamente emails detalhados após cada execução, incluindo:

#### 📊 Informações por Serviço
- **Período processado**: Data de início → Data fim
- **Tempo de execução**: Em minutos e segundos
- **Regiões processadas**: Lista das regiões coletadas
- **Estatísticas completas**:
  - Total de registros processados
  - Sucessos e falhas detalhados
  - Registros por método (Planilha vs Web Scraping)
  - Taxa de sucesso calculada

#### 📅 Próxima Execução Agendada
**Nova funcionalidade**: Cada relatório inclui informações sobre quando será a próxima execução:

```
📅 Próxima Execução Agendada: 01/09/2025 (24 dias)
```

**Formato Inteligente:**
- **"hoje"** - se a próxima execução for no mesmo dia
- **"amanhã"** - se for no próximo dia
- **"X dias"** - para outros casos

**Cálculo Automático:**
- Baseado nas configurações CRON do `.env`
- Considera configurações personalizadas ou padrão
- Atualizado automaticamente conforme as mudanças de schedule

#### 🎯 Classificação por Taxa de Sucesso
- **✅ Verde (≥90%)**: Execução excelente
- **⚠️ Amarelo (70-89%)**: Execução com alertas
- **❌ Vermelho (<70%)**: Execução com problemas

#### 📎 Anexos Opcionais
- Planilhas Excel consolidadas (quando habilitado)
- Logs detalhados de execução

### Configuração das Notificações

Configure no `.env`:
```env
# Servidor de email
EXCHANGE_HOST=smtp.office365.com
EXCHANGE_PORT=587

# Credenciais de envio
MAIL_USERNAME=seu_email@dominio.com
MAIL_PASSWORD=sua_senha

# Email(s) de destino - suporte a múltiplos destinatários
NOTIFICATION_EMAIL="destinatario@dominio.com, admin@empresa.com, relatorios@organizacao.br"
```

#### 📧 Configuração Especial - Múltiplos Destinatários

A variável `NOTIFICATION_EMAIL` suporta **múltiplos destinatários** com funcionalidades avançadas:

**Formatos Suportados:**
```env
# Um único destinatário
NOTIFICATION_EMAIL="email@empresa.com"

# Múltiplos destinatários (separados por vírgula)
NOTIFICATION_EMAIL="gestor@empresa.com, ti@empresa.com, relatorios@empresa.com"

# Com espaços extras (serão removidos automaticamente)
NOTIFICATION_EMAIL="  email1@dominio.com  ,   email2@empresa.com   "
```

**Funcionalidades Automáticas:**
- ✅ **Processamento inteligente**: Separa emails por vírgula e remove espaços extras
- ✅ **Validação de formato**: Verifica se cada email possui formato válido (`usuario@dominio.com`)
- ✅ **Filtro de inválidos**: Remove automaticamente emails com formato incorreto
- ✅ **Fallback seguro**: Se nenhum email válido for encontrado, usa email padrão configurado
- ✅ **Logs informativos**: Exibe quais destinatários foram configurados

**Exemplos de Validação:**
```env
# Emails válidos (serão enviados)
✅ admin@empresa.com
✅ admin@fecomercio-es.com.br  
✅ user+tag@domain.com
✅ user.name@domain-name.com

# Emails inválidos (serão ignorados)
❌ email-invalido
❌ outro-invalido@
❌ @dominio.com
❌ email@
```

**Comportamento do Sistema:**
- **Sem configuração**: Usa email padrão configurado no sistema
- **Emails válidos encontrados**: Envia para todos os destinatários válidos
- **Apenas emails inválidos**: Usa email padrão como fallback
- **Logs de confirmação**: Exibe `"📧 Destinatários configurados: email1, email2, email3"`

### Teste do Sistema
Execute o sistema em modo de desenvolvimento e verifique o funcionamento dos emails através dos logs de execução.

---

## 📞 Suporte

Para dúvidas ou problemas:

1. Verifique os logs da aplicação
2. Consulte este README
3. Execute os scripts de teste
4. **Verifique integridade dos metadados** usando as consultas SQL fornecidas
5. Entre em contato com o time de desenvolvimento

## 🚀 Próximas Funcionalidades

- 📊 Dashboard web para visualização de dados e metadados
- 📈 API REST para consulta de dados históricos
- 🔍 Sistema de busca avançada nos metadados
- 📱 Interface mobile para monitoramento
- 📋 Relatórios customizados com dados granulares

---

**Desenvolvido para Fecomercio-ES | Sistema CNC de Coleta Automática de Dados**

*Versão com Sistema Avançado de Metadados - Captura e preserva todos os dados estruturados das pesquisas oficiais da CNC*
