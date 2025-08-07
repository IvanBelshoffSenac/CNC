import 'reflect-metadata';
import { AppDataSource } from '../database/data-source';
import { TaskOrchestrator } from '../scheduler/orchestrator';

async function testNotificationSystem() {
    try {
        console.log('🔗 Conectando ao banco de dados...\n');
        await AppDataSource.initialize();
        console.log('🔗 Banco de dados conectado com sucesso\n');
        
        const orchestrator = new TaskOrchestrator();
        
        // Testar sistema de notificação
        await orchestrator.testNotification();
        
        console.log('\n✅ Teste de notificação concluído!');
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Erro ao testar notificação:', error);
        process.exit(1);
    }
}

testNotificationSystem();
