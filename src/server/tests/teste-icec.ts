import 'reflect-metadata';
import { AppDataSource } from '../database/data-source';
import { IcecService } from '../services/icec';

async function testeIcec() {
    console.log('🧪 === TESTE SIMPLES ICEC ===\n');

    try {
        await AppDataSource.initialize();
        console.log('🔗 Banco conectado\n');

        const icecService = new IcecService();
        
        // Testar apenas julho de 2025 primeiro
        await icecService.testSinglePeriod(7, 2025);

        console.log('✅ Teste concluído!');

    } catch (error) {
        console.error('❌ Erro durante teste:', error);
    }
    
    process.exit(0);
}

testeIcec();
