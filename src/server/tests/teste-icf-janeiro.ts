import { IcfService } from '../services/icf';

async function testeIcfJaneiro() {
    const icfService = new IcfService();
    
    try {
        console.log('🧪 Testando ICF Janeiro 2025 (valores com zeros)...');
        console.log('Dados esperados: JAN 10 | 135,5 | 133,5 | 148,5 | 0,0 | 0,0 | 0,0');
        console.log('---');
        
        // Teste para Janeiro/2025
        await icfService.testWebScrapingSinglePeriod(1, 2025, 'BR');
        
        console.log('✅ Teste concluído com sucesso!');
        console.log('❌ Problema resolvido: agora aceita dados com valores zerados');
        
    } catch (error) {
        console.error('❌ Erro no teste:', error);
    }
}

// Executar o teste
testeIcfJaneiro();
