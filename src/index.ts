import 'reflect-metadata';
import { AppDataSource } from './server/database/data-source';
import { TaskOrchestrator } from './server/scheduler/orchestrator';

async function startApplication() {
    try {
        console.log('� Conectando ao banco de dados...\n');
        await AppDataSource.initialize();
        console.log('🔗 Banco de dados conectado com sucesso\n');
        
        const orchestrator = new TaskOrchestrator();
        orchestrator.startScheduler();
        
        process.on('SIGINT', () => {
            console.log('\n� Recebido SIGINT, encerrando aplicação...');
            process.exit(0);
        });
        
        process.on('SIGTERM', () => {
            console.log('\n� Recebido SIGTERM, encerrando aplicação...');
            process.exit(0);
        });
        
    } catch (error) {
        console.error('❌ Erro ao inicializar aplicação:', error);
        process.exit(1);
    }
}

startApplication();