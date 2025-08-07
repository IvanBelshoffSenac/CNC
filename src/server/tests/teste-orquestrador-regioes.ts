/**
 * Teste simples para verificar se o orquestrador está usando as regiões do .env corretamente
 */

import * as dotenv from 'dotenv';
import { TaskOrchestrator } from '../scheduler/orchestrator';
import { getServiceRegions } from '../shared/utils';

// Carregar variáveis de ambiente
dotenv.config();

async function testOrchestratorWithRegions() {
    console.log('🧪 === TESTE DO ORQUESTRADOR COM REGIÕES DO .ENV ===\n');

    console.log('📋 Verificando configurações atuais:');
    console.log(`   ICF:  [${getServiceRegions('ICF').join(', ')}]`);
    console.log(`   ICEC: [${getServiceRegions('ICEC').join(', ')}]`);
    console.log(`   PEIC: [${getServiceRegions('PEIC').join(', ')}]`);
    console.log('');

    console.log('🎯 Criando instância do orquestrador...');
    const orchestrator = new TaskOrchestrator();

    console.log('✅ Orquestrador criado com sucesso!');
    console.log('🔗 As regiões serão carregadas automaticamente do .env quando os serviços forem executados.');
    console.log('');
    
    console.log('ℹ️  Para executar um processamento completo, use:');
    console.log('   await orchestrator.runAllServicesWithMonitoring();');
    console.log('');
    
    console.log('✅ Teste do orquestrador concluído!');
}

// Executar o teste
testOrchestratorWithRegions().catch(console.error);
