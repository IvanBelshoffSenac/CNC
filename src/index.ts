import 'reflect-metadata';
import { AppDataSource } from './server/database/data-source';
import { IcecService } from './server/services/icec';
import { IcfService } from './server/services/icf';
import { PeicService } from './server/services/peic';

async function processAllData() {
    console.log('🚀 === INICIANDO PROCESSAMENTO EM MASSA DE TODOS OS ÍNDICES ===\n');
    
    const startTime = Date.now();

    try {

        
        // ICEC - de 03/2012 até hoje
        console.log('📊 Iniciando ICEC (Março/2012 → presente)...');
        const icecService = new IcecService();
        await icecService.processAllIcecData(['BR', 'ES']);
        console.log('✅ ICEC concluído\n');

        // ICF - de 04/2012 até hoje  
        console.log('📈 Iniciando ICF (Abril/2012 → presente)...');
        const icfService = new IcfService();
        await icfService.processAllIcfData(['BR', 'ES']);
        console.log('✅ ICF concluído\n');
        
        // PEIC - de 03/2012 até o mês passado
        console.log('📋 Iniciando PEIC (Março/2012 → mês passado)...');
        const peicService = new PeicService();
        await peicService.processAllPeicData(['BR', 'ES']);
        console.log('✅ PEIC concluído\n');

        const endTime = Date.now();
        const duration = Math.round((endTime - startTime) / 1000 / 60); // em minutos

        console.log('🎉 === PROCESSAMENTO COMPLETO FINALIZADO ===');
        console.log(`⏱️  Tempo total: ${duration} minutos`);
        console.log('📊 Todos os índices foram processados e salvos no banco de dados');
        console.log('💾 Dados históricos desde 2012 até presente disponíveis\n');

    } catch (error) {
        console.error('❌ Erro durante o processamento:', error);
        process.exit(1);
    }
}

AppDataSource.initialize().then(async () => {
    console.log('🔗 Banco de dados conectado com sucesso\n');
    
    // Executar processamento automático
    await processAllData();
    
    // Encerrar aplicação
    console.log('🔚 Encerrando aplicação...');
    process.exit(0);

}).catch(error => {
    console.error('❌ Erro ao conectar ao banco de dados:', error);
    process.exit(1);
});