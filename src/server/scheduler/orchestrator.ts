import * as cron from 'node-cron';
import * as dotenv from 'dotenv';
import { IcecService } from '../services/icec';
import { IcfService } from '../services/icf';
import { PeicService } from '../services/peic';
import { NotificationService } from '../services/notification';
import { IServiceResult } from '../shared/interfaces';
import { getServiceRegions } from '../shared/utils';

// Configurar dotenv
dotenv.config();

export class TaskOrchestrator {
    private isRunning: boolean = false;
    private notificationService = new NotificationService();

    constructor() {
        console.log('🎯 Orquestrador de Tarefas inicializado');
        console.log('📅 Agendamentos serão configurados dinamicamente via variáveis de ambiente');
        console.log('   • Configure SCHEDULE_ICEC, SCHEDULE_ICF, SCHEDULE_PEIC no .env');
        console.log('   • Padrão: ICEC às 02:00, ICF às 05:00, PEIC às 08:00 (todo dia 1)');
        console.log('   • Relatório: Enviado automaticamente após cada execução\n');
    }

    /**
     * Executa processamento individual do ICEC com monitoramento
     */
    private async runIcecWithMonitoring(): Promise<IServiceResult> {
        try {
            console.log('📊 [CRON] Iniciando ICEC com monitoramento (Janeiro/2010 → presente)...');
            const icecService = new IcecService();
            const regioes = getServiceRegions('ICEC');
            const resultado = await icecService.processAllIcecDataWithMonitoring(regioes);
            console.log('✅ [CRON] ICEC concluído\n');
            return resultado;
        } catch (error) {
            console.error('❌ [CRON] Erro no processamento ICEC:', error);
            throw error;
        }
    }

    /**
     * Executa processamento individual do ICF com monitoramento
     */
    private async runIcfWithMonitoring(): Promise<IServiceResult> {
        try {
            console.log('📈 [CRON] Iniciando ICF com monitoramento (Janeiro/2010 → presente)...');
            const icfService = new IcfService();
            const regioes = getServiceRegions('ICF');
            const resultado = await icfService.processAllIcfDataWithMonitoring(regioes);
            console.log('✅ [CRON] ICF concluído\n');
            return resultado;
        } catch (error) {
            console.error('❌ [CRON] Erro no processamento ICF:', error);
            throw error;
        }
    }

    /**
     * Executa processamento individual do PEIC com monitoramento
     */
    private async runPeicWithMonitoring(): Promise<IServiceResult> {
        try {
            console.log('📋 [CRON] Iniciando PEIC com monitoramento (Janeiro/2010 → mês passado)...');
            const peicService = new PeicService();
            const regioes = getServiceRegions('PEIC');
            const resultado = await peicService.processAllPeicDataWithMonitoring(regioes);
            console.log('✅ [CRON] PEIC concluído\n');
            return resultado;
        } catch (error) {
            console.error('❌ [CRON] Erro no processamento PEIC:', error);
            throw error;
        }
    }

    /**
     * Executa todos os serviços em sequência com monitoramento completo
     */
    public async runAllServicesWithMonitoring(): Promise<void> {
        if (this.isRunning) {
            console.log('⚠️  Processamento já em execução, aguarde a conclusão...');
            return;
        }

        console.log('🚀 === INICIANDO PROCESSAMENTO COMPLETO COM MONITORAMENTO ===\n');
        const startTime = Date.now();
        this.isRunning = true;

        const resultados: IServiceResult[] = [];

        try {
            // Executar todos os serviços
            const icecResult = await this.runIcecWithMonitoring();
            resultados.push(icecResult);

            const icfResult = await this.runIcfWithMonitoring();
            resultados.push(icfResult);

            const peicResult = await this.runPeicWithMonitoring();
            resultados.push(peicResult);

            const endTime = Date.now();
            const duration = Math.round((endTime - startTime) / 1000 / 60);

            console.log('🎉 === PROCESSAMENTO COMPLETO FINALIZADO ===');
            console.log(`⏱️  Tempo total: ${duration} minutos`);
            console.log('📊 Todos os índices foram processados e salvos no banco de dados');

            // Enviar relatório por e-mail
            console.log('📧 Enviando relatório de monitoramento...');
            await this.notificationService.enviarRelatorioCompleto(resultados, 'Forçado');

        } catch (error) {
            console.error('❌ Erro durante o processamento completo:', error);
            
            // Mesmo com erro, tentar enviar relatório parcial
            if (resultados.length > 0) {
                try {
                    console.log('📧 Enviando relatório parcial devido ao erro...');
                    await this.notificationService.enviarRelatorioCompleto(resultados, 'Forçado');
                } catch (notificationError) {
                    console.error('❌ Erro adicional ao enviar notificação:', notificationError);
                }
            }
            throw error;
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Executa todos os serviços em sequência (modo forçado - COM monitoramento e notificação)
     */
    public async runAllServicesNow(): Promise<void> {
        if (this.isRunning) {
            console.log('⚠️  Processamento já em execução, aguarde a conclusão...');
            return;
        }

        console.log('🚀 === INICIANDO PROCESSAMENTO FORÇADO COM MONITORAMENTO ===\n');
        const startTime = Date.now();
        this.isRunning = true;

        const resultados: IServiceResult[] = [];

        try {
            // Executar com monitoramento
            const icecResult = await this.runIcecWithMonitoring();
            icecResult.modoExecucao = 'Forçado';
            resultados.push(icecResult);

            const icfResult = await this.runIcfWithMonitoring();
            icfResult.modoExecucao = 'Forçado';
            resultados.push(icfResult);

            const peicResult = await this.runPeicWithMonitoring();
            peicResult.modoExecucao = 'Forçado';
            resultados.push(peicResult);

            const endTime = Date.now();
            const duration = Math.round((endTime - startTime) / 1000 / 60);

            console.log('🎉 === PROCESSAMENTO FORÇADO FINALIZADO ===');
            console.log(`⏱️  Tempo total: ${duration} minutos`);
            console.log('📊 Todos os índices foram processados e salvos no banco de dados');

            // Enviar relatório por e-mail
            console.log('📧 Enviando relatório de monitoramento (modo forçado)...');
            await this.notificationService.enviarRelatorioCompleto(resultados, 'Forçado');

        } catch (error) {
            console.error('❌ Erro durante o processamento forçado:', error);
            
            // Mesmo com erro, tentar enviar relatório parcial
            if (resultados.length > 0) {
                try {
                    console.log('📧 Enviando relatório parcial devido ao erro...');
                    await this.notificationService.enviarRelatorioCompleto(resultados, 'Forçado');
                } catch (notificationError) {
                    console.error('❌ Erro adicional ao enviar notificação:', notificationError);
                }
            }
            throw error;
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Executa tarefa individual com controle de sobreposição e monitoramento
     */
    private async runTaskWithMonitoring(taskName: string, taskFunction: () => Promise<IServiceResult>): Promise<void> {
        if (this.isRunning) {
            console.log(`⚠️  [${taskName}] Tarefa ignorada - processamento em execução`);
            return;
        }

        console.log(`🕐 [${taskName}] Iniciando execução agendada com monitoramento...`);
        const startTime = Date.now();
        this.isRunning = true;

        try {
            const resultado = await taskFunction();
            resultado.modoExecucao = 'Agendado';
            const duration = Math.round((Date.now() - startTime) / 1000 / 60);
            console.log(`✅ [${taskName}] Concluído em ${duration} minutos`);

            // Enviar notificação individual
            console.log(`📧 [${taskName}] Enviando relatório...`);
            await this.notificationService.enviarRelatorioCompleto([resultado], 'Agendado');

        } catch (error) {
            console.error(`❌ [${taskName}] Erro:`, error);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Inicia o orquestrador com agendamentos CRON (com monitoramento)
     */
    public startScheduler(): void {
        // Configurações de agendamento das variáveis de ambiente ou valores padrão
        const scheduleIcec = process.env.SCHEDULE_ICEC || '0 2 1 * *';
        const scheduleIcf = process.env.SCHEDULE_ICF || '0 5 1 * *';
        const schedulePeic = process.env.SCHEDULE_PEIC || '0 8 1 * *';

        console.log('⚡ Configurações de agendamento:');
        console.log(`   • ICEC: ${scheduleIcec} ${process.env.SCHEDULE_ICEC ? '(customizado)' : '(padrão)'}`);
        console.log(`   • ICF:  ${scheduleIcf} ${process.env.SCHEDULE_ICF ? '(customizado)' : '(padrão)'}`);
        console.log(`   • PEIC: ${schedulePeic} ${process.env.SCHEDULE_PEIC ? '(customizado)' : '(padrão)'}`);
        console.log('');

        // ICEC: Agendamento configurável - COM MONITORAMENTO
        cron.schedule(scheduleIcec, async () => {
            await this.runTaskWithMonitoring('ICEC', () => this.runIcecWithMonitoring());
        }, {
            timezone: "America/Sao_Paulo"
        });

        // ICF: Agendamento configurável - COM MONITORAMENTO
        cron.schedule(scheduleIcf, async () => {
            await this.runTaskWithMonitoring('ICF', () => this.runIcfWithMonitoring());
        }, {
            timezone: "America/Sao_Paulo"
        });

        // PEIC: Agendamento configurável - COM MONITORAMENTO
        cron.schedule(schedulePeic, async () => {
            await this.runTaskWithMonitoring('PEIC', () => this.runPeicWithMonitoring());
        }, {
            timezone: "America/Sao_Paulo"
        });

        console.log('⚡ Orquestrador ativo com monitoramento - aguardando próximas execuções...');
        console.log('🔄 Para forçar execução com monitoramento: npm run force-monitored');
        console.log('🔄 Para forçar execução sem monitoramento: npm run force\n');
    }

    /**
     * Método para testar o sistema de notificação
     */
    public async testNotification(): Promise<void> {
        console.log('🧪 Testando sistema de notificação...');
        await this.notificationService.testarNotificacao();
    }

    /**
     * Retorna status da execução
     */
    public getStatus(): { isRunning: boolean; nextExecutions: string[] } {
        const scheduleIcec = process.env.SCHEDULE_ICEC || '0 2 1 * *';
        const scheduleIcf = process.env.SCHEDULE_ICF || '0 5 1 * *';
        const schedulePeic = process.env.SCHEDULE_PEIC || '0 8 1 * *';

        return {
            isRunning: this.isRunning,
            nextExecutions: [
                `ICEC: ${scheduleIcec}`,
                `ICF: ${scheduleIcf}`, 
                `PEIC: ${schedulePeic}`
            ]
        };
    }
}
