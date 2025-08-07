/**
 * Teste para verificar o novo formato do relatório com regiões
 */

import * as dotenv from 'dotenv';
import { NotificationService } from '../services/notification';
import { IServiceResult } from '../shared/interfaces';

// Carregar variáveis de ambiente
dotenv.config();

async function testNotificationWithRegions() {
    console.log('🧪 === TESTE DE NOTIFICAÇÃO COM REGIÕES ===\n');

    const notificationService = new NotificationService();

    // Criar dados de teste com múltiplas regiões
    const resultadosTeste: IServiceResult[] = [
        {
            servico: 'ICEC',
            periodoInicio: '01/2010',
            periodoFim: '08/2025',
            tempoExecucao: 1800, // 30 minutos
            tasks: [
                { mes: 1, ano: 2010, regiao: 'BR', status: 'Sucesso', servico: 'ICEC', metodo: 'Planilha' as any },
                { mes: 1, ano: 2010, regiao: 'ES', status: 'Sucesso', servico: 'ICEC', metodo: 'Planilha' as any },
                { mes: 2, ano: 2010, regiao: 'BR', status: 'Falha', servico: 'ICEC', metodo: 'Web Scraping' as any, erro: 'Arquivo não encontrado' },
                { mes: 2, ano: 2010, regiao: 'ES', status: 'Sucesso', servico: 'ICEC', metodo: 'Web Scraping' as any },
                { mes: 3, ano: 2010, regiao: 'SP', status: 'Sucesso', servico: 'ICEC', metodo: 'Planilha' as any }
            ],
            totalRegistros: 180,
            registrosPlanilha: 150,
            registrosWebScraping: 30,
            sucessos: 4,
            falhas: 1,
            modoExecucao: 'Forçado'
        },
        {
            servico: 'ICF',
            periodoInicio: '01/2010',
            periodoFim: '08/2025',
            tempoExecucao: 1200, // 20 minutos
            tasks: [
                { mes: 1, ano: 2010, regiao: 'BR', status: 'Sucesso', servico: 'ICF', metodo: 'Planilha' as any },
                { mes: 1, ano: 2010, regiao: 'ES', status: 'Sucesso', servico: 'ICF', metodo: 'Planilha' as any }
            ],
            totalRegistros: 120,
            registrosPlanilha: 120,
            registrosWebScraping: 0,
            sucessos: 2,
            falhas: 0,
            modoExecucao: 'Forçado'
        },
        {
            servico: 'PEIC',
            periodoInicio: '01/2010',
            periodoFim: '07/2025',
            tempoExecucao: 900, // 15 minutos
            tasks: [
                { mes: 1, ano: 2010, regiao: 'BR', status: 'Sucesso', servico: 'PEIC', metodo: 'Planilha' as any }
            ],
            totalRegistros: 60,
            registrosPlanilha: 60,
            registrosWebScraping: 0,
            sucessos: 1,
            falhas: 0,
            modoExecucao: 'Forçado'
        }
    ];

    console.log('📊 Dados de teste criados:');
    console.log(`   ICEC: Regiões ${[...new Set(resultadosTeste[0].tasks.map(t => t.regiao))].join(', ')}`);
    console.log(`   ICF:  Regiões ${[...new Set(resultadosTeste[1].tasks.map(t => t.regiao))].join(', ')}`);
    console.log(`   PEIC: Regiões ${[...new Set(resultadosTeste[2].tasks.map(t => t.regiao))].join(', ')}`);
    console.log('');

    console.log('📧 Enviando relatório de teste...');
    await notificationService.enviarRelatorioCompleto(resultadosTeste, 'Forçado');

    console.log('✅ Teste de notificação com regiões concluído!');
}

// Executar o teste
testNotificationWithRegions().catch(console.error);
