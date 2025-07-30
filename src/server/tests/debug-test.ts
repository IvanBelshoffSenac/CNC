import 'reflect-metadata';
import { AppDataSource } from '../database/data-source';
import { DebugService } from '../services/debug';

async function debugPlanilhas() {
    console.log('🔍 === ANALISANDO ESTRUTURA DAS PLANILHAS ===\n');

    try {
        const debugService = new DebugService();

        // Análise ICEC - período mais recente
        await debugService.analyzeExcelStructure(7, 2025, 'ICEC');

        // Análise ICF - período mais recente  
        await debugService.analyzeExcelStructure(7, 2025, 'ICF');

        // Análise PEIC - período mais recente
        await debugService.analyzeExcelStructure(7, 2025, 'PEIC');

        console.log('\n✅ Análise concluída!');

    } catch (error) {
        console.error('❌ Erro durante análise:', error);
    }
}

AppDataSource.initialize().then(async () => {
    console.log('🔗 Banco conectado para debug\n');
    
    await debugPlanilhas();
    
    process.exit(0);
}).catch(error => {
    console.error('❌ Erro ao conectar:', error);
    process.exit(1);
});
