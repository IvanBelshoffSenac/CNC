# 📊 CNC - Sistema de Coleta de Índices Econômicos

Sistema automatizado para coleta, processamento e armazenamento de dados dos índices econômicos ICEC (Índice de Confiança do Empresário do Comércio), ICF (Índice de Confiança do Consumidor) e PEIC (Pesquisa de Expectativa de Investimento do Comércio) da FeComércio/ES.

## 🚀 Tecnologias Utilizadas

- **Node.js** com **TypeScript**
- **TypeORM** para ORM e migrations
- **MySQL** como banco de dados
- **Axios** para requisições HTTP
- **XLSX** para manipulação de planilhas Excel
- **dotenv** para gerenciamento de variáveis de ambiente

## 📋 Funcionalidades

### Índices Coletados:

1. **ICEC** - Índice de Confiança do Empresário do Comércio
   - Coleta dados desde março/2012 até presente
   - Categorias: Até 50 funcionários, Mais de 50, Semiduráveis, Não duráveis, Duráveis

2. **ICF** - Índice de Confiança do Consumidor  
   - Coleta dados desde abril/2012 até presente
   - Análise de confiança do consumidor por região

3. **PEIC** - Pesquisa de Expectativa de Investimento do Comércio
   - Coleta dados desde março/2012 até presente
   - Expectativas de investimento empresarial

### Regiões Suportadas:
- **BR** - Brasil (nacional)
- **ES** - Espírito Santo (estadual)

## 📁 Estrutura do Projeto

```
CNC/
├── src/
│   ├── index.ts                    # Ponto de entrada da aplicação
│   └── server/
│       ├── database/
│       │   ├── data-source.ts      # Configuração do banco de dados
│       │   ├── entities/           # Entidades do banco (ICEC, ICF, PEIC)
│       │   ├── migrations/         # Migrações do banco
│       │   └── repositories/       # Repositórios para acesso aos dados
│       ├── services/               # Serviços de processamento (icec, icf, peic)
│       ├── shared/                 # Interfaces compartilhadas
│       └── tests/                  # Arquivos de teste e debug
├── temp/                           # Arquivos temporários (Excel baixados)
├── package.json
├── tsconfig.json
└── README.md
```

## ⚙️ Configuração e Instalação

### 1. Pré-requisitos

- Node.js (versão 16 ou superior)
- MySQL 8.0+
- NPM ou Yarn

### 2. Instalação

```bash
# Clonar o repositório
git clone <url-do-repositorio>
cd CNC

# Instalar dependências
npm install
```

### 3. Configuração do Banco de Dados

Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:

```env
# Configurações do Banco de Dados
DB_HOST=localhost
DB_PORT=3306
DB_USER=seu_usuario
DB_PASSWORD=sua_senha
DB_NAME=cnc_database

# URL Base da API
BASE_URL=https://backend.pesquisascnc.com.br/admin/4/upload
```

### 4. Configuração do Banco

```bash
# Executar migrações
npm run migration:run
```

## 🚀 Como Executar

### Processamento Completo (Produção)
```bash
npm start
```

### Modo Desenvolvimento (com hot reload)
```bash
npm run dev
```

### Comandos de Migração
```bash
# Gerar nova migração
npm run migration:generate

# Executar migrações pendentes
npm run migration:run

# Reverter última migração
npm run migration:revert
```

## 📊 Funcionamento do Sistema

### Fluxo de Processamento:

1. **Inicialização**: Conecta ao banco de dados MySQL
2. **Processamento Sequencial**:
   - ICEC (Março/2012 → presente)
   - ICF (Abril/2012 → presente)  
   - PEIC (Março/2012 → presente)
3. **Para cada índice**:
   - Gera períodos mensais desde data inicial
   - Para cada região (BR, ES):
     - Baixa arquivo Excel da API
     - Extrai e processa dados
     - Salva no banco de dados
     - Remove arquivo temporário
4. **Finalização**: Exibe estatísticas e encerra

### Exemplo de Saída:
```
🔗 Banco de dados conectado com sucesso

🚀 === INICIANDO PROCESSAMENTO EM MASSA DE TODOS OS ÍNDICES ===

📊 Iniciando ICEC (Março/2012 → presente)...
📊 Processando ICEC BR 03/2012
✅ ICEC concluído

📈 Iniciando ICF (Abril/2012 → presente)...
📈 Processando ICF BR 04/2012
✅ ICF concluído

📋 Iniciando PEIC (Março/2012 → presente)...
📋 Processando PEIC BR 03/2012
✅ PEIC concluído

🎉 === PROCESSAMENTO COMPLETO FINALIZADO ===
⏱️  Tempo total: 15 minutos
📊 Todos os índices foram processados e salvos no banco de dados
💾 Dados históricos desde 2012 até presente disponíveis
```

## 📊 Estrutura dos Dados

### Tabela ICEC
```sql
- id (UUID, PK)
- ICEC (FLOAT) - Índice principal
- ATÉ_50 (FLOAT) - Empresas até 50 funcionários
- MAIS_DE_50 (FLOAT) - Empresas com mais de 50 funcionários
- SEMIDURAVEIS (FLOAT)
- NAO_DURAVEIS (FLOAT)
- DURAVEIS (FLOAT)
- MES (INT)
- ANO (INT)
- REGIAO (ENUM: 'BR', 'ES')
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

### Tabela ICF
```sql
- id (UUID, PK)
- ICF (FLOAT) - Índice de Confiança do Consumidor
- MES (INT)
- ANO (INT)
- REGIAO (ENUM: 'BR', 'ES')
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

### Tabela PEIC
```sql
- id (UUID, PK)
- PEIC (FLOAT) - Índice de Expectativa de Investimento
- MES (INT)
- ANO (INT)
- REGIAO (ENUM: 'BR', 'ES')
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

## 🛠️ Scripts Disponíveis

| Script | Descrição |
|--------|-----------|
| `npm start` | Executa o processamento completo dos dados |
| `npm run dev` | Executa em modo desenvolvimento com hot reload |
| `npm run build` | Compila o TypeScript para JavaScript |
| `npm run typeorm` | Executa comandos do TypeORM |
| `npm run migration:generate` | Gera nova migração baseada nas mudanças das entidades |
| `npm run migration:run` | Executa todas as migrações pendentes |
| `npm run migration:revert` | Reverte a última migração executada |

## 🔧 Desenvolvimento

### Adicionando Novos Índices

1. Criar nova entidade em `src/server/database/entities/`
2. Criar repositório em `src/server/database/repositories/`
3. Implementar serviço em `src/server/services/`
4. Adicionar processamento no `src/index.ts`
5. Gerar e executar migração

### Testando Componentes

O projeto inclui vários arquivos de teste na pasta `src/server/tests/`:
- `teste-icec.ts` - Teste isolado do ICEC
- `teste-icf.ts` - Teste isolado do ICF  
- `teste-peic-final.ts` - Teste isolado do PEIC
- `teste-multiplas-regioes.ts` - Teste com múltiplas regiões

## 📈 Monitoramento e Logs

O sistema fornece logs detalhados durante a execução:
- ✅ Sucessos com estatísticas
- ❌ Erros com detalhes
- 📊 Progress de processamento
- ⏱️ Tempo de execução
- 💾 Estatísticas de salvamento

## 🚨 Tratamento de Erros

- **Conexão com Banco**: Falha graceful com log de erro
- **Download de Arquivos**: Retry automático e skip em falha
- **Processamento Excel**: Validação de dados e log de inconsistências
- **Duplicatas**: Prevenção através de chaves únicas

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/nova-feature`)
3. Commit suas mudanças (`git commit -am 'Adiciona nova feature'`)
4. Push para a branch (`git push origin feature/nova-feature`)
5. Abra um Pull Request

## 📝 Licença

Este projeto está sob a licença MIT. Veja o arquivo LICENSE para mais detalhes.

## 📞 Suporte

Para dúvidas ou problemas:
- Abra uma issue no repositório
- Entre em contato com a equipe de desenvolvimento da FeComércio/ES

---

**Desenvolvido com ❤️ para FeComércio/ES**
