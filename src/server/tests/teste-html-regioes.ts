/**
 * Teste para visualizar o HTML gerado pelo relatório com regiões
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs-extra';
import * as path from 'path';
import { NotificationService } from '../services/notification';
import { IServiceResult } from '../shared/interfaces';

// Carregar variáveis de ambiente
dotenv.config();

async function testHtmlGeneration() {
    console.log('🧪 === TESTE DE GERAÇÃO DE HTML COM REGIÕES ===\n');

    // Criar dados de teste com múltiplas regiões
    const resultadosTeste: IServiceResult[] = [
        {
            servico: 'ICEC',
            periodoInicio: '01/2010',
            periodoFim: '08/2025',
            tempoExecucao: 1800,
            tasks: [
                { mes: 1, ano: 2010, regiao: 'BR', status: 'Sucesso', servico: 'ICEC', metodo: 'Planilha' as any },
                { mes: 1, ano: 2010, regiao: 'ES', status: 'Sucesso', servico: 'ICEC', metodo: 'Planilha' as any },
                { mes: 2, ano: 2010, regiao: 'SP', status: 'Falha', servico: 'ICEC', metodo: 'Web Scraping' as any, erro: 'Erro de conexão' }
            ],
            totalRegistros: 180,
            registrosPlanilha: 150,
            registrosWebScraping: 30,
            sucessos: 2,
            falhas: 1,
            modoExecucao: 'Forçado'
        },
        {
            servico: 'ICF',
            periodoInicio: '01/2010',
            periodoFim: '08/2025',
            tempoExecucao: 1200,
            tasks: [
                { mes: 1, ano: 2010, regiao: 'BR', status: 'Sucesso', servico: 'ICF', metodo: 'Planilha' as any },
                { mes: 1, ano: 2010, regiao: 'ES', status: 'Sucesso', servico: 'ICF', metodo: 'Planilha' as any },
                { mes: 2, ano: 2010, regiao: 'RJ', status: 'Sucesso', servico: 'ICF', metodo: 'Web Scraping' as any }
            ],
            totalRegistros: 120,
            registrosPlanilha: 100,
            registrosWebScraping: 20,
            sucessos: 3,
            falhas: 0,
            modoExecucao: 'Forçado'
        }
    ];

    // Acessar o método privado através de uma classe herdada
    class TestNotificationService extends NotificationService {
        public testGerarCorpoEmail(resultados: IServiceResult[], modo: 'Agendado' | 'Forçado' = 'Forçado'): string {
            return (this as any).gerarCorpoEmail(resultados, modo);
        }
    }

    const testService = new TestNotificationService();
    const htmlGerado = testService.testGerarCorpoEmail(resultadosTeste, 'Forçado');

    // Salvar HTML para visualização
    const htmlPath = path.join(process.cwd(), 'temp', 'relatorio_teste.html');
    await fs.ensureDir(path.dirname(htmlPath));
    await fs.writeFile(htmlPath, htmlGerado);

    console.log('📄 HTML gerado e salvo em:', htmlPath);
    console.log('');
    console.log('📋 Resumo do que foi gerado:');
    
    // Extrair informações do HTML para mostrar
    const regioesIcec = [...new Set(resultadosTeste[0].tasks.map(t => t.regiao))].sort();
    const regioesIcf = [...new Set(resultadosTeste[1].tasks.map(t => t.regiao))].sort();
    
    console.log(`   ICEC: Regiões ${regioesIcec.join(', ')}`);
    console.log(`   ICF:  Regiões ${regioesIcf.join(', ')}`);
    console.log('');
    
    // Verificar se as regiões estão no HTML
    const contemIcecRegioes = regioesIcec.every(regiao => htmlGerado.includes(regiao));
    const contemIcfRegioes = regioesIcf.every(regiao => htmlGerado.includes(regiao));
    
    console.log('✅ Verificação de conteúdo:');
    console.log(`   Regiões ICEC no HTML: ${contemIcecRegioes ? '✅' : '❌'}`);
    console.log(`   Regiões ICF no HTML:  ${contemIcfRegioes ? '✅' : '❌'}`);
    console.log('');
    
    // Mostrar um trecho do HTML com as regiões
    const linhasHtml = htmlGerado.split('\n');
    const linhasComRegiao = linhasHtml.filter(linha => 
        linha.includes('Regiões Apuradas') || 
        linha.includes('BR, ES') || 
        linha.includes('BR, ES, RJ')
    );
    
    if (linhasComRegiao.length > 0) {
        console.log('📄 Trechos do HTML com regiões:');
        linhasComRegiao.forEach(linha => {
            console.log(`   ${linha.trim()}`);
        });
    }
    
    console.log('');
    console.log('✅ Teste de geração HTML concluído!');
    console.log(`📁 Arquivo salvo em: ${htmlPath}`);
}

// Executar o teste
testHtmlGeneration().catch(console.error);
