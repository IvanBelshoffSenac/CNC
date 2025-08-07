/**
 * Teste avançado para verificar diferentes cenários de configuração de regiões
 */

import * as dotenv from 'dotenv';
import { getServiceRegions } from '../shared/utils';

// Carregar variáveis de ambiente
dotenv.config();

async function testAdvancedScenarios() {
    console.log('🧪 === TESTE AVANÇADO DE CONFIGURAÇÃO DE REGIÕES ===\n');

    // Cenário 1: Configuração normal (já testada, mas vamos verificar novamente)
    console.log('📋 Cenário 1: Configuração normal do .env');
    const regioesPeic = getServiceRegions('PEIC');
    console.log(`   PEIC: [${regioesPeic.join(', ')}]`);
    console.log('');

    // Cenário 2: Simular configuração com espaços extras
    console.log('📋 Cenário 2: Testando parse de string com espaços');
    const originalRegionsPeic = process.env.REGIONS_PEIC;
    
    // Temporariamente modificar a variável para testar
    process.env.REGIONS_PEIC = " BR , ES , RJ ";
    const regioesComEspacos = getServiceRegions('PEIC');
    console.log(`   PEIC com espaços: [${regioesComEspacos.join(', ')}]`);
    
    // Restaurar valor original
    process.env.REGIONS_PEIC = originalRegionsPeic;
    console.log('');

    // Cenário 3: Simular configuração vazia
    console.log('📋 Cenário 3: Testando configuração vazia');
    const originalRegionsIcf = process.env.REGIONS_ICF;
    
    process.env.REGIONS_ICF = "";
    const regioesVazias = getServiceRegions('ICF');
    console.log(`   ICF vazio: [${regioesVazias.join(', ')}]`);
    
    // Restaurar valor original
    process.env.REGIONS_ICF = originalRegionsIcf;
    console.log('');

    // Cenário 4: Simular configuração apenas com vírgulas
    console.log('📋 Cenário 4: Testando configuração com apenas vírgulas');
    const originalRegionsIcec = process.env.REGIONS_ICEC;
    
    process.env.REGIONS_ICEC = ",,,";
    const regioesApenasComas = getServiceRegions('ICEC');
    console.log(`   ICEC apenas vírgulas: [${regioesApenasComas.join(', ')}]`);
    
    // Restaurar valor original
    process.env.REGIONS_ICEC = originalRegionsIcec;
    console.log('');

    // Cenário 5: Simular região única
    console.log('📋 Cenário 5: Testando região única');
    process.env.REGIONS_ICF = "SP";
    const regiaoUnica = getServiceRegions('ICF');
    console.log(`   ICF região única: [${regiaoUnica.join(', ')}]`);
    
    // Restaurar valor original
    process.env.REGIONS_ICF = originalRegionsIcf;
    console.log('');

    // Cenário 6: Simular muitas regiões
    console.log('📋 Cenário 6: Testando múltiplas regiões');
    process.env.REGIONS_ICEC = "BR,ES,SP,RJ,MG,RS,PR,SC";
    const multiplaRegioes = getServiceRegions('ICEC');
    console.log(`   ICEC múltiplas regiões: [${multiplaRegioes.join(', ')}]`);
    console.log(`   Total: ${multiplaRegioes.length} regiões`);
    
    // Restaurar valor original
    process.env.REGIONS_ICEC = originalRegionsIcec;
    console.log('');

    // Cenário 7: Teste de normalização (minúsculas para maiúsculas)
    console.log('📋 Cenário 7: Testando normalização de caixa');
    process.env.REGIONS_PEIC = "br,es,sp";
    const regioesNormalizadas = getServiceRegions('PEIC');
    console.log(`   PEIC normalizadas: [${regioesNormalizadas.join(', ')}]`);
    
    // Restaurar valor original
    process.env.REGIONS_PEIC = originalRegionsPeic;
    console.log('');

    console.log('✅ Todos os cenários de teste foram executados com sucesso!');
}

// Executar o teste
testAdvancedScenarios().catch(console.error);
