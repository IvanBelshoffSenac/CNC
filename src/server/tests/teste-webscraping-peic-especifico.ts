import { peicService } from '../services/peic';

async function testeWebScrapingPeic() {
    try {
        console.log('🚀 Iniciando teste específico do Web Scraping PEIC...\n');
        
        // Testar um período específico que sabemos que existe
        // Julho de 2025 - baseado na tabela que você forneceu
        await peicService.testWebScrapingSinglePeriod(7, 2025, 'BR');
        
        console.log('\n✅ Teste de web scraping concluído com sucesso!');
        
    } catch (error) {
        console.error('❌ Erro no teste de web scraping:', error);
    } finally {
        // Forçar saída do processo
        process.exit(0);
    }
}

// Executar o teste se este arquivo for executado diretamente
if (require.main === module) {
    testeWebScrapingPeic();
}

export { testeWebScrapingPeic };
