import { NotificationService } from '../services/notification';
import { IServiceResult, Metodo } from '../shared/interfaces';

/**
 * Teste específico para múltiplos destinatários
 */
async function testeMultiplosDestinatariosReal() {
    console.log('🧪 TESTE - MÚLTIPLOS DESTINATÁRIOS (REAL)');
    console.log('='.repeat(50));
    
    // Salvar configuração original
    const originalEmail = process.env.NOTIFICATION_EMAIL;
    
    // Configurar múltiplos destinatários para teste
    process.env.NOTIFICATION_EMAIL = 'ivan.belshoff@senac.es.gov.br, ivan.belshoff@es.senac.br';
    
    console.log(`📧 Configuração de teste: "${process.env.NOTIFICATION_EMAIL}"`);
    console.log('📋 Destinatários esperados:');
    console.log('   1. ivan.belshoff@senac.es.gov.br');
    console.log('   2. ivan.belshoff@es.senac.br');
    
    const notificationService = new NotificationService();
    
    // Dados mínimos para teste rápido
    const resultadoTeste: IServiceResult[] = [
        {
            servico: 'ICEC',
            periodoInicio: '08/2025',
            periodoFim: '08/2025',
            tempoExecucao: 120, // 2 minutos
            tasks: [
                { mes: 8, ano: 2025, regiao: 'BR', status: 'Sucesso', servico: 'ICEC', metodo: Metodo.PLA }
            ],
            totalRegistros: 1,
            registrosPlanilha: 1,
            registrosWebScraping: 0,
            sucessos: 1,
            falhas: 0,
            modoExecucao: 'Forçado'
        }
    ];
    
    try {
        console.log('\n🚀 Enviando para múltiplos destinatários...');
        await notificationService.enviarRelatorioCompleto(resultadoTeste, 'Forçado');
        
        console.log('\n✅ TESTE MÚLTIPLOS DESTINATÁRIOS CONCLUÍDO!');
        console.log('\n📨 Verifique AMBOS os emails:');
        console.log('   • ivan.belshoff@senac.es.gov.br');
        console.log('   • ivan.belshoff@es.senac.br');
        
    } catch (error) {
        console.error('\n❌ ERRO:', error);
    } finally {
        // Restaurar configuração original
        process.env.NOTIFICATION_EMAIL = originalEmail;
        console.log(`\n🔄 Configuração restaurada: "${originalEmail}"`);
    }
}

// Executar teste
if (require.main === module) {
    testeMultiplosDestinatariosReal()
        .then(() => {
            console.log('\n🎉 Teste de múltiplos destinatários finalizado!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Erro:', error);
            process.exit(1);
        });
}

export { testeMultiplosDestinatariosReal };
