#!/bin/bash
# =================================================================
# SCRIPT DE INICIALIZAÇÃO MYSQL - SISTEMA CNC
# =================================================================
# Configura permissões e otimizações iniciais

echo "🔧 Configurando banco de dados CNC..."

# Criar usuário com permissões específicas (se não existir)
mysql -u root -p"$MYSQL_ROOT_PASSWORD" <<-EOSQL
    -- Garantir que o usuário existe
    CREATE USER IF NOT EXISTS '$MYSQL_USER'@'%' IDENTIFIED BY '$MYSQL_PASSWORD';
    
    -- Conceder permissões necessárias
    GRANT ALL PRIVILEGES ON $MYSQL_DATABASE.* TO '$MYSQL_USER'@'%';
    
    -- Permissões para operações específicas do CNC
    GRANT CREATE, DROP, ALTER, INDEX ON $MYSQL_DATABASE.* TO '$MYSQL_USER'@'%';
    GRANT INSERT, UPDATE, DELETE, SELECT ON $MYSQL_DATABASE.* TO '$MYSQL_USER'@'%';
    
    -- Aplicar mudanças
    FLUSH PRIVILEGES;
    
    -- Configurar timezone para o banco
    SET GLOBAL time_zone = '-03:00';
    
    -- Otimizações específicas para CNC
    SET GLOBAL innodb_flush_log_at_trx_commit = 2;
    SET GLOBAL sync_binlog = 0;
EOSQL

echo "✅ Banco de dados CNC configurado com sucesso!"

# Verificar se as tabelas TypeORM devem ser criadas
if [ "$AUTO_CREATE_TABLES" = "true" ]; then
    echo "🔄 Aguardando aplicação criar tabelas automaticamente..."
fi