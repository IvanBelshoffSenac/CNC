import 'reflect-metadata';
import { AppDataSource } from '../database/data-source';
import { IcfService } from '../services/icf';

async function testeIcf() {
    console.log('🧪 === TESTE SIMPLES ICF ===\n');

    try {
        await AppDataSource.initialize();
        console.log('🔗 Banco conectado\n');

        const icfService = new IcfService();
        
        // Testar apenas julho de 2025 primeiro
        await icfService.testSinglePeriod(7, 2025);

        console.log('✅ Teste concluído!');

    } catch (error) {
        console.error('❌ Erro durante teste:', error);
    }
    
    process.exit(0);
}

testeIcf();
