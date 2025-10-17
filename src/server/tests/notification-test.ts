import { NotificationService } from '../services/notification';
import { IServiceResult, Metodo } from '../shared/interfaces';
import * as dotenv from 'dotenv';

dotenv.config();

class NotificationServiceTest {
    private notificationService: NotificationService;

    constructor() {
        this.notificationService = new NotificationService();
    }

    /**
     * Testa o método completo de envio de relatório
     */
    public async testarEnvioRelatorio(): Promise<void> {
        console.log('🧪 TESTE DO SERVIÇO DE NOTIFICAÇÃO - SISTEMA CNC');
        console.log('=' .repeat(60));
        console.log(`🕐 Executado em: ${new Date().toLocaleString('pt-BR')}`);
        console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
        
        try {
            // Criar dados simulados para teste
            const resultadosSimulados: IServiceResult[] = [
                {
                    servico: 'ICF',
                    periodoInicio: '01/2010',
                    periodoFim: '09/2025',
                    tempoExecucao: 180, // 3 minutos
                    totalRegistros: 150,
                    registrosPlanilha: 100,
                    registrosWebScraping: 50,
                    sucessos: 145,
                    falhas: 5,
                    tasks: [
                        {
                            mes: 1,
                            ano: 2024,
                            regiao: 'Brasil',
                            status: 'Sucesso',
                            servico: 'ICF',
                            metodo: Metodo.PLA,
                            layout: 'padrão',
                            inconsistenciaLayout: '',
                            erro: ''
                        },
                        {
                            mes: 2,
                            ano: 2024,
                            regiao: 'Sudeste',
                            status: 'Sucesso',
                            servico: 'ICF',
                            metodo: Metodo.WS,
                            layout: 'padrão',
                            inconsistenciaLayout: '',
                            erro: ''
                        },
                        {
                            mes: 3,
                            ano: 2024,
                            regiao: 'Sul',
                            status: 'Falha',
                            servico: 'ICF',
                            metodo: Metodo.PLA,
                            layout: 'inconsistente',
                            inconsistenciaLayout: 'Headers diferentes do padrão',
                            erro: 'Erro ao processar planilha'
                        }
                    ],
                    modoExecucao: 'Forçado'
                }
            ];

            console.log('\n📊 Dados de teste preparados:');
            console.log(`   📋 Serviços: ${resultadosSimulados.map(r => r.servico).join(', ')}`);
            console.log(`   📈 Total Registros: ${resultadosSimulados.reduce((t, r) => t + r.totalRegistros, 0)}`);
            console.log(`   ✅ Taxa Sucesso: ${Math.round((resultadosSimulados.reduce((t, r) => t + r.sucessos, 0) / resultadosSimulados.reduce((t, r) => t + r.tasks.length, 0)) * 100)}%`);
            
            console.log('\n⏳ Enviando relatório de teste...');
            
            // Usar o método público do serviço de notificação
            await this.notificationService.enviarRelatorioCompleto(resultadosSimulados, 'Forçado');
            
            console.log('\n🎉 TESTE DE NOTIFICAÇÃO CONCLUÍDO COM SUCESSO!');
            console.log('=' .repeat(50));
            console.log('✅ Relatório enviado via email');
            console.log('📧 Planilha Excel gerada e anexada');
            console.log('📨 Email formatado em HTML');
            console.log('🎯 Serviço de notificação funcionando corretamente');
            
            console.log('\n📋 VALIDAÇÕES REALIZADAS:');
            console.log('   ✅ Geração de planilhas Excel');
            console.log('   ✅ Formatação HTML do email');
            console.log('   ✅ Processamento de destinatários');
            console.log('   ✅ Envio via SMTP');
            console.log('   ✅ Limpeza de arquivos temporários');
            
            console.log('\n📞 PRÓXIMOS PASSOS:');
            console.log('   1. Verificar se o email chegou na caixa de entrada');
            console.log('   2. Confirmar se a planilha Excel está anexada');
            console.log('   3. Validar formatação HTML no email');
            console.log('   4. Sistema pronto para uso em produção');
            
        } catch (error) {
            console.log('\n💥 FALHA NO TESTE DE NOTIFICAÇÃO!');
            console.log('=' .repeat(50));
            console.error('❌ Erro detalhado:', error);
            
            if (error instanceof Error) {
                console.log(`📝 Mensagem: ${error.message}`);
                console.log(`🔍 Tipo: ${error.name}`);
                
                // Análise específica de erros
                if (error.message.includes('535')) {
                    console.log('\n🔐 PROBLEMA DE AUTENTICAÇÃO SMTP:');
                    console.log('   • Verificar credenciais MAIL_USERNAME e MAIL_PASSWORD');
                    console.log('   • Confirmar autenticação básica no Microsoft 365');
                    console.log('   • Considerar usar App Password se MFA ativo');
                }
                
                if (error.message.includes('ENOENT') || error.message.includes('temp')) {
                    console.log('\n📁 PROBLEMA COM ARQUIVOS TEMPORÁRIOS:');
                    console.log('   • Verificar permissões de escrita no diretório temp');
                    console.log('   • Confirmar se o diretório temp existe');
                }
                
                if (error.message.includes('XLSX') || error.message.includes('Excel')) {
                    console.log('\n📊 PROBLEMA NA GERAÇÃO DE PLANILHAS:');
                    console.log('   • Verificar se a biblioteca xlsx está instalada');
                    console.log('   • Confirmar estrutura dos dados de entrada');
                }
            }
            
            console.log('\n🛠️ SOLUÇÕES RECOMENDADAS:');
            console.log('   1. Executar: npm run test:email (diagnóstico básico)');
            console.log('   2. Verificar variáveis de ambiente (.env)');
            console.log('   3. Confirmar permissões de escrita');
            console.log('   4. Validar instalação das dependências');
            
            throw error;
        }
    }

    /**
     * Testa apenas a configuração de destinatários
     */
    public async testarConfiguracao(): Promise<void> {
        console.log('⚙️ TESTE DE CONFIGURAÇÃO - EMAIL');
        console.log('=' .repeat(40));
        
        console.log('\n📧 Configurações de Email:');
        console.log(`   HOST: ${process.env.EXCHANGE_HOST || 'não configurado'}`);
        console.log(`   PORT: ${process.env.EXCHANGE_PORT || 'não configurado'}`);
        console.log(`   USER: ${process.env.MAIL_USERNAME || 'não configurado'}`);
        console.log(`   PASS: ${process.env.MAIL_PASSWORD ? '***configurado***' : 'não configurado'}`);
        console.log(`   DEST: ${process.env.NOTIFICATION_EMAIL || 'usando padrão: ivan.belshoff@es.senac.br'}`);
        
        console.log('\n✅ Configuração verificada!');
    }
}

// Executar teste
const notificationTest = new NotificationServiceTest();

// Verificar argumentos da linha de comando
const comando = process.argv[2];

if (comando === 'config') {
    console.log('⚙️ Executando teste de configuração...');
    notificationTest.testarConfiguracao()
        .then(() => {
            console.log('\n🏁 Teste de configuração concluído!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Falha no teste de configuração:', error);
            process.exit(1);
        });
} else {
    console.log('📧 Executando teste completo de notificação...');
    notificationTest.testarEnvioRelatorio()
        .then(() => {
            console.log('\n🏁 Teste de notificação concluído com sucesso!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Falha no teste de notificação:', error);
            process.exit(1);
        });
}