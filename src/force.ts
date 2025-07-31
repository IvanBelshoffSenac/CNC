import 'reflect-metadata';
import { AppDataSource } from './server/database/data-source';
import { TaskOrchestrator } from './server/scheduler/orchestrator';

async function forceExecution() {
    try {
        console.log('🔗 Conectando ao banco de dados...\n');
        await AppDataSource.initialize();
        console.log('🔗 Banco de dados conectado com sucesso\n');
        
        const orchestrator = new TaskOrchestrator();
        await orchestrator.runAllServicesNow();
        
        console.log('🔚 Encerrando aplicação...');
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Erro durante execução forçada:', error);
        process.exit(1);
    }
}

forceExecution();
