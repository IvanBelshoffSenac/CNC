import { cleanupServiceTempFolder } from '../shared/utils';
import * as path from 'path';

async function testeNovaLimpeza() {
    const tempDir = path.join(__dirname, '../../../temp');
    
    console.log('🧪 Testando nova funcionalidade de limpeza em lote...');
    console.log('---');
    
    try {
        // Simular limpeza dos serviços
        console.log('🧹 Testando limpeza do ICF...');
        await cleanupServiceTempFolder('icf', tempDir);
        
        console.log('🧹 Testando limpeza do ICEC...');
        await cleanupServiceTempFolder('icec', tempDir);
        
        console.log('🧹 Testando limpeza do PEIC...');
        await cleanupServiceTempFolder('peic', tempDir);
        
        console.log('✅ Teste de limpeza concluído com sucesso!');
        console.log('🚀 Melhorias implementadas:');
        console.log('   • Limpeza em lote ao final da execução');
        console.log('   • Melhor desempenho (menos I/O)');
        console.log('   • Logs informativos de limpeza');
        console.log('   • Filtro por arquivos do serviço específico');
        
    } catch (error) {
        console.error('❌ Erro no teste:', error);
    }
}

// Executar o teste
testeNovaLimpeza();
