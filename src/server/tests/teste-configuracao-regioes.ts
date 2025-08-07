/**
 * Teste para verificar a configuração de regiões através do .env
 */

import * as dotenv from 'dotenv';
import { getServiceRegions } from '../shared/utils';

// Carregar variáveis de ambiente
dotenv.config();

async function testServiceRegions() {
    console.log('🧪 === TESTE DE CONFIGURAÇÃO DE REGIÕES ===\n');

    // Testar configuração para cada serviço
    const services: Array<'ICF' | 'ICEC' | 'PEIC'> = ['ICF', 'ICEC', 'PEIC'];

    for (const service of services) {
        console.log(`📊 Testando ${service}:`);
        
        try {
            const regioes = getServiceRegions(service);
            console.log(`   ✅ Regiões obtidas: [${regioes.join(', ')}]`);
            console.log(`   📍 Total de regiões: ${regioes.length}`);
            
            // Verificar se há duplicatas
            const regioesUnicas = [...new Set(regioes)];
            if (regioesUnicas.length !== regioes.length) {
                console.log(`   ⚠️ Atenção: Foram encontradas regiões duplicadas!`);
                console.log(`   🔍 Regiões únicas: [${regioesUnicas.join(', ')}]`);
            }
            
        } catch (error) {
            console.log(`   ❌ Erro ao obter regiões: ${error}`);
        }
        
        console.log(''); // Linha em branco
    }

    console.log('📋 === VALORES NO .ENV ===');
    console.log(`   REGIONS_ICF: "${process.env.REGIONS_ICF || 'não definido'}"`);
    console.log(`   REGIONS_ICEC: "${process.env.REGIONS_ICEC || 'não definido'}"`);
    console.log(`   REGIONS_PEIC: "${process.env.REGIONS_PEIC || 'não definido'}"`);
    
    console.log('\n✅ Teste de configuração de regiões concluído!');
}

// Executar o teste
testServiceRegions().catch(console.error);
