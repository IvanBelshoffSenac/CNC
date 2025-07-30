import 'reflect-metadata';
import { AppDataSource } from '../database/data-source';
import { IcecService } from '../services/icec';
import { IcfService } from '../services/icf';
import { PeicService } from '../services/peic';

async function testeMultiplasRegioes() {
    console.log('🧪 === TESTE DE MÚLTIPLAS REGIÕES ===\n');

    try {
        // Testar ICEC com BR e ES
        console.log('📊 Testando ICEC - Brasil e Espírito Santo');
        const icecService = new IcecService();
        
        // Teste com uma região (BR)
        await icecService.testSinglePeriod(3, 2024, 'BR');
        
        // Teste com outra região (ES)
        await icecService.testSinglePeriod(3, 2024, 'ES');
        
        console.log('✅ ICEC testado com sucesso para ambas as regiões\n');

        // Testar ICF com BR e ES
        console.log('📈 Testando ICF - Brasil e Espírito Santo');
        const icfService = new IcfService();
        
        // Teste com uma região (BR)
        await icfService.testSinglePeriod(4, 2024, 'BR');
        
        // Teste com outra região (ES)
        await icfService.testSinglePeriod(4, 2024, 'ES');
        
        console.log('✅ ICF testado com sucesso para ambas as regiões\n');

        // Testar PEIC com BR e ES
        console.log('📋 Testando PEIC - Brasil e Espírito Santo');
        const peicService = new PeicService();
        
        // Teste com uma região (BR)
        await peicService.testSinglePeriod(4, 2024, 'BR');
        
        // Teste com outra região (ES)
        await peicService.testSinglePeriod(4, 2024, 'ES');
        
        console.log('✅ PEIC testado com sucesso para ambas as regiões\n');

        console.log('🎉 === TESTE CONCLUÍDO COM SUCESSO ===');
        console.log('📊 Todos os serviços agora suportam múltiplas regiões');
        console.log('🔧 Para processar todas as regiões use:');
        console.log('   - icecService.processAllIcecData([\'BR\', \'ES\'])');
        console.log('   - icfService.processAllIcfData([\'BR\', \'ES\'])');
        console.log('   - peicService.processAllPeicData([\'BR\', \'ES\'])\n');

    } catch (error) {
        console.error('❌ Erro durante o teste:', error);
    }
}

AppDataSource.initialize().then(async () => {
    console.log('🔗 Banco de dados conectado com sucesso\n');
    
    await testeMultiplasRegioes();
    
    console.log('🔚 Encerrando teste...');
    process.exit(0);

}).catch(error => {
    console.error('❌ Erro ao conectar ao banco de dados:', error);
    process.exit(1);
});
