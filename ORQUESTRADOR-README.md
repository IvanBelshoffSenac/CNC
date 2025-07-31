# 🎯 Sistema Orquestrador CNC - Guia de Uso

## 📋 Visão Geral

Este sistema implementa um **orquestrador automatizado** para processamento mensal dos índices CNC (ICEC, ICF e PEIC). O sistema oferece dois modos de operação:

1. **Modo Orquestrador** (`npm start`) - Execução automática mensal
2. **Modo Forçado** (`npm run force`) - Execução imediata

---

## 🚀 Comandos Disponíveis

### 🔄 Modo Orquestrador (Automático)
```bash
npm start
```
- **Funcionamento**: Fica em execução contínua aguardando as datas programadas
- **Agendamento**: Todo dia 1º de cada mês
  - **ICEC**: 02:00 (horário de Brasília)
  - **ICF**: 05:00 (horário de Brasília)  
  - **PEIC**: 08:00 (horário de Brasília)
- **Ideal para**: Servidores em produção

### ⚡ Modo Forçado (Imediato)
```bash
npm run force
```
- **Funcionamento**: Executa todos os serviços imediatamente em sequência
- **Ordem**: ICEC → ICF → PEIC
- **Ideal para**: Testes, recuperação de dados ou execução pontual

---

## 🛡️ Recursos de Segurança

### 🔒 Controle de Sobreposição
- **Verificação**: Impede execução simultânea de processos
- **Comportamento**: Se um serviço estiver rodando, outros aguardam
- **Logs**: Mensagens claras sobre status da execução

### 🕒 Horários Escalonados
- **ICEC**: 02:00 - Menor impacto no servidor
- **ICF**: 05:00 - Espaçamento de 3 horas
- **PEIC**: 08:00 - Finalização antes do horário comercial

---

## 📊 Monitoramento

### 🖥️ Logs do Sistema
O sistema fornece logs detalhados com:
- ✅ Status de sucesso/erro por região e período
- ⏱️ Tempo de execução
- 📈 Progresso em tempo real
- 🚨 Alertas de conflitos de execução

### 🔍 Exemplos de Logs
```
🎯 Orquestrador de Tarefas inicializado
📅 Agendamentos configurados:
   • ICEC: Todo dia 1 às 02:00
   • ICF:  Todo dia 1 às 05:00
   • PEIC: Todo dia 1 às 08:00

⚡ Orquestrador ativo - aguardando próximas execuções...
🔄 Para forçar execução imediata, use: npm run force
```

---

## 🔧 Configuração Técnica

### 📦 Dependências Adicionadas
- `node-cron` - Agendamento de tarefas
- `@types/node-cron` - Tipos TypeScript

### 🏗️ Estrutura do Projeto
```
src/
├── index.ts              # Modo orquestrador (npm start)
├── force.ts              # Modo forçado (npm run force)
└── server/
    └── scheduler/
        └── orchestrator.ts # Lógica do orquestrador
```

### ⚙️ Configurações CRON
- **Padrão**: `0 H 1 * *` (Todo dia 1 às H horas)
- **Timezone**: America/Sao_Paulo
- **Formato**: Minuto Hora Dia Mês DiaDaSemana

---

## 🚦 Comandos de Controle

### ▶️ Iniciar Orquestrador
```bash
npm start
```

### ⏹️ Parar Orquestrador
- **Ctrl+C** no terminal
- **SIGINT/SIGTERM** são tratados graciosamente

### 🔄 Execução Forçada
```bash
npm run force
```

---

## 📅 Cronograma de Execução

| Serviço | Horário | Dados Processados | Duração Estimada |
|---------|---------|-------------------|------------------|
| **ICEC** | 02:00 | Março/2012 → Presente | ~15-20 min |
| **ICF**  | 05:00 | Abril/2012 → Presente | ~10-15 min |
| **PEIC** | 08:00 | Março/2012 → Mês Anterior | ~20-25 min |

---

## 🎛️ Casos de Uso

### 🔧 Desenvolvimento e Testes
```bash
# Testar processamento completo
npm run force

# Verificar agendamentos
npm start
# (aguardar logs de confirmação, depois Ctrl+C)
```

### 🏭 Produção
```bash
# Iniciar em modo daemon/service
npm start

# Monitorar logs em tempo real
# Logs aparecem automaticamente no console
```

### 🆘 Recuperação de Dados
```bash
# Executar processamento imediato
npm run force
```

---

## ⚠️ Observações Importantes

1. **Conexão com Banco**: Necessária para ambos os modos
2. **Recursos de Rede**: Dependente de conectividade com fontes de dados
3. **Espaço em Disco**: Arquivos temporários criados durante processamento
4. **Memória**: Processamento intensivo durante execução dos serviços

---

## 📞 Suporte

Para problemas ou dúvidas sobre o sistema orquestrador, verifique:
- ✅ Conectividade com banco de dados
- ✅ Variáveis de ambiente configuradas
- ✅ Disponibilidade das fontes de dados externas
- ✅ Espaço em disco suficiente

---

*Sistema desenvolvido para automação completa do processamento CNC* 🎯
