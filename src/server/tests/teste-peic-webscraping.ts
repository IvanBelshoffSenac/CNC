import { peicService } from '../services/peic';

async function testeWebScraping() {
    try {
        console.log('🚀 Iniciando teste do serviço PEIC com Web Scraping...\n');
        
        // Processar apenas alguns períodos para teste
        // O serviço tentará primeiro por download de arquivo
        // Se falhar, tentará por web scraping
        await peicService.processAllPeicData(['BR']);
        
        console.log('\n✅ Teste concluído com sucesso!');
        
    } catch (error) {
        console.error('❌ Erro no teste:', error);
    } finally {
        // Forçar saída do processo para evitar que o teste fique travado
        process.exit(0);
    }
}

// Executar o teste se este arquivo for executado diretamente
if (require.main === module) {
    testeWebScraping();
}

export { testeWebScraping };
