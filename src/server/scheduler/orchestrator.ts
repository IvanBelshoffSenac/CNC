import * as cron from 'node-cron';
import { IcecService } from '../services/icec';
import { IcfService } from '../services/icf';
import { PeicService } from '../services/peic';

export class TaskOrchestrator {
    private isRunning: boolean = false;

    constructor() {
        console.log('🎯 Orquestrador de Tarefas inicializado');
        console.log('📅 Agendamentos configurados:');
        console.log('   • ICEC: Todo dia 1 às 02:00');
        console.log('   • ICF:  Todo dia 1 às 05:00');
        console.log('   • PEIC: Todo dia 1 às 08:00\n');
    }

    /**
     * Executa processamento individual do ICEC
     */
    private async runIcec(): Promise<void> {
        try {
            console.log('📊 [CRON] Iniciando ICEC (Março/2012 → presente)...');
            const icecService = new IcecService();
            await icecService.processAllIcecData(['BR', 'ES']);
            console.log('✅ [CRON] ICEC concluído\n');
        } catch (error) {
            console.error('❌ [CRON] Erro no processamento ICEC:', error);
        }
    }

    /**
     * Executa processamento individual do ICF
     */
    private async runIcf(): Promise<void> {
        try {
            console.log('📈 [CRON] Iniciando ICF (Abril/2012 → presente)...');
            const icfService = new IcfService();
            await icfService.processAllIcfData(['BR', 'ES']);
            console.log('✅ [CRON] ICF concluído\n');
        } catch (error) {
            console.error('❌ [CRON] Erro no processamento ICF:', error);
        }
    }

    /**
     * Executa processamento individual do PEIC
     */
    private async runPeic(): Promise<void> {
        try {
            console.log('📋 [CRON] Iniciando PEIC (Março/2012 → mês passado)...');
            const peicService = new PeicService();
            await peicService.processAllPeicData(['BR', 'ES']);
            console.log('✅ [CRON] PEIC concluído\n');
        } catch (error) {
            console.error('❌ [CRON] Erro no processamento PEIC:', error);
        }
    }

    /**
     * Executa todos os serviços em sequência (modo forçado)
     */
    public async runAllServicesNow(): Promise<void> {
        if (this.isRunning) {
            console.log('⚠️  Processamento já em execução, aguarde a conclusão...');
            return;
        }

        console.log('🚀 === INICIANDO PROCESSAMENTO FORÇADO DE TODOS OS ÍNDICES ===\n');
        const startTime = Date.now();
        this.isRunning = true;

        try {
            await this.runIcec();
            await this.runIcf();
            await this.runPeic();

            const endTime = Date.now();
            const duration = Math.round((endTime - startTime) / 1000 / 60);

            console.log('🎉 === PROCESSAMENTO FORÇADO FINALIZADO ===');
            console.log(`⏱️  Tempo total: ${duration} minutos`);
            console.log('📊 Todos os índices foram processados e salvos no banco de dados');
            console.log('💾 Dados históricos desde 2012 até presente disponíveis\n');

        } catch (error) {
            console.error('❌ Erro durante o processamento forçado:', error);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Executa tarefa individual com controle de sobreposição
     */
    private async runTask(taskName: string, taskFunction: () => Promise<void>): Promise<void> {
        if (this.isRunning) {
            console.log(`⚠️  [${taskName}] Tarefa ignorada - processamento em execução`);
            return;
        }

        console.log(`🕐 [${taskName}] Iniciando execução agendada...`);
        const startTime = Date.now();
        this.isRunning = true;

        try {
            await taskFunction();
            const duration = Math.round((Date.now() - startTime) / 1000 / 60);
            console.log(`✅ [${taskName}] Concluído em ${duration} minutos\n`);
        } catch (error) {
            console.error(`❌ [${taskName}] Erro:`, error);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Inicia o orquestrador com agendamentos CRON
     */
    public startScheduler(): void {
        // ICEC: Todo dia 1 às 02:00
        cron.schedule('0 2 1 * *', async () => {
            await this.runTask('ICEC', () => this.runIcec());
        }, {
            timezone: "America/Sao_Paulo"
        });

        // ICF: Todo dia 1 às 05:00
        cron.schedule('0 5 1 * *', async () => {
            await this.runTask('ICF', () => this.runIcf());
        }, {
            timezone: "America/Sao_Paulo"
        });

        // PEIC: Todo dia 1 às 08:00
        cron.schedule('0 8 1 * *', async () => {
            await this.runTask('PEIC', () => this.runPeic());
        }, {
            timezone: "America/Sao_Paulo"
        });

        console.log('⚡ Orquestrador ativo - aguardando próximas execuções...');
        console.log('🔄 Para forçar execução imediata, use: npm run force\n');
    }

    /**
     * Retorna status da execução
     */
    public getStatus(): { isRunning: boolean; nextExecutions: string[] } {
        return {
            isRunning: this.isRunning,
            nextExecutions: [
                'ICEC: Próximo dia 1 às 02:00',
                'ICF: Próximo dia 1 às 05:00', 
                'PEIC: Próximo dia 1 às 08:00'
            ]
        };
    }
}
