import { NotificationService } from '../services/notification';
import { IServiceResult, Metodo } from '../shared/interfaces';

/**
 * Teste completo do sistema de notificação com múltiplos destinatários
 */
async function testeNotificacaoCompleta() {
    console.log('🧪 TESTE COMPLETO - SISTEMA DE NOTIFICAÇÃO');
    console.log('='.repeat(50));
    
    const notificationService = new NotificationService();
    
    // Dados de exemplo para teste
    const resultadosTeste: IServiceResult[] = [
        {
            servico: 'ICEC',
            periodoInicio: '01/2024',
            periodoFim: '08/2025',
            tempoExecucao: 1850, // ~31 minutos
            tasks: [
                { mes: 7, ano: 2025, regiao: 'BR', status: 'Sucesso', servico: 'ICEC', metodo: Metodo.PLA },
                { mes: 7, ano: 2025, regiao: 'ES', status: 'Sucesso', servico: 'ICEC', metodo: Metodo.PLA },
                { mes: 6, ano: 2025, regiao: 'BR', status: 'Falha', servico: 'ICEC', metodo: Metodo.WS, erro: 'Timeout de conexão' },
                { mes: 6, ano: 2025, regiao: 'ES', status: 'Sucesso', servico: 'ICEC', metodo: Metodo.WS }
            ],
            totalRegistros: 1250,
            registrosPlanilha: 900,
            registrosWebScraping: 350,
            sucessos: 3,
            falhas: 1,
            modoExecucao: 'Forçado'
        },
        {
            servico: 'ICF',
            periodoInicio: '01/2024',
            periodoFim: '06/2025',
            tempoExecucao: 2100, // 35 minutos
            tasks: [
                { mes: 6, ano: 2025, regiao: 'BR', status: 'Sucesso', servico: 'ICF', metodo: Metodo.PLA },
                { mes: 6, ano: 2025, regiao: 'ES', status: 'Sucesso', servico: 'ICF', metodo: Metodo.PLA },
                { mes: 5, ano: 2025, regiao: 'BR', status: 'Sucesso', servico: 'ICF', metodo: Metodo.WS },
                { mes: 5, ano: 2025, regiao: 'ES', status: 'Sucesso', servico: 'ICF', metodo: Metodo.WS }
            ],
            totalRegistros: 2100,
            registrosPlanilha: 1400,
            registrosWebScraping: 700,
            sucessos: 4,
            falhas: 0,
            modoExecucao: 'Forçado'
        }
    ];

    console.log('📊 Dados de teste preparados:');
    console.log(`   • ${resultadosTeste.length} serviços`);
    console.log(`   • Total de tasks: ${resultadosTeste.reduce((sum, r) => sum + r.tasks.length, 0)}`);
    console.log(`   • Total de registros: ${resultadosTeste.reduce((sum, r) => sum + r.totalRegistros, 0)}`);
    
    console.log('\n📧 Configuração atual de destinatários:');
    console.log(`   NOTIFICATION_EMAIL: "${process.env.NOTIFICATION_EMAIL}"`);
    
    try {
        console.log('\n🚀 Enviando relatório de teste...');
        await notificationService.enviarRelatorioCompleto(resultadosTeste, 'Forçado');
        
        console.log('\n✅ TESTE CONCLUÍDO COM SUCESSO!');
        console.log('\n📋 Verificações a fazer:');
        console.log('1. ✉️  Verifique se o email foi recebido em todos os destinatários');
        console.log('2. 📅 Confirme se as próximas execuções estão corretas');
        console.log('3. 📊 Validar se os dados dos serviços estão apresentados corretamente');
        console.log('4. 📎 Verificar se os anexos (planilhas) foram incluídos');
        
    } catch (error) {
        console.error('\n❌ ERRO NO TESTE:', error);
        throw error;
    }
}

// Executar o teste
if (require.main === module) {
    testeNotificacaoCompleta()
        .then(() => {
            console.log('\n🎉 Teste finalizado!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Falha no teste:', error);
            process.exit(1);
        });
}

export { testeNotificacaoCompleta };
