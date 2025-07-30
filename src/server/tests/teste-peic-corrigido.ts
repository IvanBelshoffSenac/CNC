import { peicService } from '../services/peic';

async function testePeicCorrigido() {
    console.log('🧪 Testando serviço PEIC corrigido...\n');

    try {
        // Testar um período específico
        await peicService.testSinglePeriod(6, 2013);
        
        console.log('\n✅ Teste do período 06/2013 concluído com sucesso!');
        
        // Testar outro período
        await peicService.testSinglePeriod(12, 2020);
        
        console.log('\n✅ Teste do período 12/2020 concluído com sucesso!');
        
    } catch (error) {
        console.log(`❌ Erro no teste: ${error}`);
    }
}

testePeicCorrigido();
