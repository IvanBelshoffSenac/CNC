import axios from 'axios';
import * as XLSX from 'xlsx';
import * as fs from 'fs-extra';
import * as path from 'path';
import { chromium } from 'playwright';
import { peicRepository } from '../database/repositories';
import { Peic } from '../database/entities';
import { Regiao, Metodo, IErrorService, ITask, IServiceResult } from '../shared/interfaces';
import { 
    generatePeriods, 
    formatPeriod, 
    formatPeriodDisplay, 
    calculateExecutionTime, 
    calculateTaskStats, 
    cleanupServiceTempFolder,
    LogMessages
} from '../shared/utils';

export class PeicService {
    private readonly TEMP_DIR = path.join(__dirname, '../../../temp');
    private baseUrl = process.env.BASE_URL || 'https://backend.pesquisascnc.com.br/admin/4/upload';

    /**
     * Versão com monitoramento do processamento PEIC
     */
    public async processAllPeicDataWithMonitoring(regioes: string[] = ['BR']): Promise<IServiceResult> {
        const startTime = Date.now();
        console.log('🚀 Iniciando processamento completo dos dados PEIC com monitoramento...\n');

        const resultadoLimpeza = await this.cleanDatabase();
        console.log(resultadoLimpeza);

        console.log(`📍 Regiões a processar: ${regioes.join(', ')}\n`);

        const periods = generatePeriods(true); // PEIC vai até mês anterior
        const tasks: ITask[] = [];
        let registrosPlanilha = 0;
        let registrosWebScraping = 0;
        let erros: IErrorService[] = [];

        for (const period of periods) {
            for (const regiao of regioes) {
                try {
                    console.log(LogMessages.processando('PEIC', regiao, period.mes, period.ano));

                    const filePath = await this.downloadFile(period.mes, period.ano, regiao);
                    const data = await this.extractDataFromExcel(filePath, period.mes, period.ano, regiao);
                    await this.saveToDatabase(data);
                    // Arquivo será limpo ao final da execução

                    console.log(LogMessages.sucesso('PEIC', regiao, period.mes, period.ano));
                    
                    tasks.push({
                        mes: period.mes,
                        ano: period.ano,
                        regiao,
                        status: 'Sucesso',
                        servico: 'PEIC',
                        metodo: Metodo.PLA
                    });
                    
                    registrosPlanilha++;

                } catch (error) {
                    console.log(LogMessages.erro('PEIC', regiao, period.mes, period.ano, error));
                    
                    tasks.push({
                        mes: period.mes,
                        ano: period.ano,
                        regiao,
                        status: 'Falha',
                        servico: 'PEIC',
                        metodo: Metodo.PLA,
                        erro: error.toString()
                    });
                    
                    erros.push({
                        regiao,
                        mes: period.mes,
                        ano: period.ano
                    });
                }
            }
        }

        // Segunda tentativa com web scraping para os erros
        if (erros.length > 0) {
            console.log(`\n🔄 Iniciando segunda tentativa com web scraping para ${erros.length} períodos...`);
            const sucessosWebScraping = await this.retryWithWebScrapingMonitoring(erros, tasks);
            registrosWebScraping = sucessosWebScraping;
        }

        const endTime = Date.now();
        const tempoExecucao = calculateExecutionTime(startTime, endTime);
        
        const { sucessos, falhas } = calculateTaskStats(tasks);

        const resultado: IServiceResult = {
            servico: 'PEIC',
            periodoInicio: '01/2010',
            periodoFim: formatPeriod(undefined, true), // PEIC vai até mês passado
            tempoExecucao,
            tasks,
            totalRegistros: tasks.length, // Total geral (sucessos + falhas)
            registrosPlanilha,
            registrosWebScraping,
            sucessos,
            falhas
        };

        console.log(`\n=== Processamento PEIC concluído ===`);
        console.log(`Sucessos: ${sucessos}`);
        console.log(`Falhas: ${falhas}`);
        console.log(`Tempo: ${Math.round(tempoExecucao / 60)} minutos`);
        console.log(`Registros por planilha: ${registrosPlanilha}`);
        console.log(`Registros por web scraping: ${registrosWebScraping}`);

        // Limpeza da pasta temp ao final da execução
        await cleanupServiceTempFolder('peic', this.TEMP_DIR);

        return resultado;
    }

    public async processAllPeicData(regioes: string[] = ['BR']): Promise<void> {
        console.log('🚀 Iniciando processamento completo dos dados PEIC...\n');

        const resultadoLimpeza = await this.cleanDatabase();
        console.log(resultadoLimpeza);

        console.log(`📍 Regiões a processar: ${regioes.join(', ')}\n`);

        const periods = generatePeriods(true); // PEIC vai até mês anterior
        let processados = 0;
        let sucessos = 0;
        let erros: IErrorService[] = [];
        const totalProcessos = periods.length * regioes.length;

        for (const period of periods) {
            for (const regiao of regioes) {
                try {
                    console.log(LogMessages.processando('PEIC', regiao, period.mes, period.ano));

                    const filePath = await this.downloadFile(period.mes, period.ano, regiao);
                    const data = await this.extractDataFromExcel(filePath, period.mes, period.ano, regiao);
                    await this.saveToDatabase(data);
                    // Arquivo será limpo ao final da execução

                    console.log(LogMessages.sucesso('PEIC', regiao, period.mes, period.ano));
                    sucessos++;

                } catch (error) {
                    console.log(LogMessages.erro('PEIC', regiao, period.mes, period.ano, error));
                    erros.push({
                        regiao,
                        mes: period.mes,
                        ano: period.ano
                    });
                }

                processados++;
            }
        }

        console.log(`\n=== Processamento concluído ===`);
        console.log(`Sucessos: ${sucessos}`);
        console.log(`Erros: ${erros.length}`);
        console.log(`Total: ${totalProcessos}`);

        if (erros.length > 0) {
            console.log(`\n📋 Lista de períodos com erro:`);
            erros.forEach(erro => {
                console.log(`   ❌ ${erro.regiao} ${erro.mes.toString().padStart(2, '0')}/${erro.ano}`);
            });

            // Segunda tentativa com web scraping
            console.log(`\n🔄 Iniciando segunda tentativa com web scraping...`);
            await this.retryWithWebScraping(erros);
        }
    }

    private async cleanDatabase(): Promise<string> {

        try {
            await peicRepository.clear();

            return '✅ Base de dados PEIC limpa com sucesso\n';

        } catch (error) {
            return `Erro ao limpar a base de dados PEIC: ${error}\n`;
        }

    }

    private buildUrl(mes: number, ano: number, regiao: string = 'BR'): string {
        return `${this.baseUrl}/${mes}_${ano}/PEIC/${regiao}.xls`;
    }

    private async downloadFile(mes: number, ano: number, regiao: string = 'BR'): Promise<string> {
        try {
            const url = this.buildUrl(mes, ano, regiao);
            const response = await axios.get(url, { responseType: 'stream' });

            const tempDir = path.join(process.cwd(), 'temp');
            await fs.ensureDir(tempDir);

            const filePath = path.join(tempDir, `peic_${regiao}_${mes}_${ano}.xls`);
            const writer = fs.createWriteStream(filePath);

            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', () => resolve(filePath));
                writer.on('error', reject);
            });
        } catch (error) {
            throw new Error(`Erro ao baixar arquivo PEIC: ${error}`);
        }
    }

    private async extractDataFromExcel(filePath: string, mes: number, ano: number, regiao: string = 'BR'): Promise<Peic> {
        try {
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null }) as any[][];

            const peicData: Partial<Peic> = {
                MES: mes,
                ANO: ano,
                REGIAO: regiao as Regiao,
                METODO: Metodo.PLA
            };

            // Extrair dados percentuais (linhas 54, 55, 56)
            this.extractPercentualData(jsonData, peicData);

            // Extrair dados absolutos (linhas 60, 61, 62)
            this.extractAbsolutoData(jsonData, peicData);

            // Verificar se todos os campos obrigatórios foram preenchidos
            if (!this.isValidPeicData(peicData)) {
                throw new Error('Dados PEIC incompletos extraídos do arquivo');
            }

            return peicData as Peic;
        } catch (error) {
            throw new Error(`Erro ao processar arquivo PEIC: ${error}`);
        }
    }

    private extractPercentualData(jsonData: any[][], peicData: Partial<Peic>): void {
        // Buscar especificamente a seção "PEIC (Percentual)"
        for (let i = 0; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (row && row[0]) {
                const cellText = String(row[0]).toLowerCase();

                // Identificar a seção PEIC (Percentual)
                if (cellText.includes('peic') && cellText.includes('percentual')) {
                    // Processar as próximas linhas desta seção (geralmente linhas 54, 55, 56)
                    for (let j = i + 1; j < Math.min(i + 10, jsonData.length); j++) {
                        const dataRow = jsonData[j];
                        if (dataRow && dataRow[0] && dataRow[1] !== null && dataRow[1] !== undefined) {
                            const dataText = String(dataRow[0]).toLowerCase();

                            // Verificar se é um valor decimal (percentual) - valores absolutos são maiores que 1000
                            if (typeof dataRow[1] === 'number' && dataRow[1] < 1) {
                                // Linha 54: Famílias endividadas
                                if (dataText.includes('famílias endividadas') &&
                                    !dataText.includes('atraso') &&
                                    !dataText.includes('condições') &&
                                    !peicData.ENDIVIDADOS_PERCENTUAL) {
                                    const value = this.parsePercentual(dataRow[1]);
                                    peicData.ENDIVIDADOS_PERCENTUAL = value;
                                }
                                // Linha 55: Famílias com conta em Atraso
                                else if (dataText.includes('famílias com conta em atraso') &&
                                    !dataText.includes('condições') &&
                                    !peicData.CONTAS_EM_ATRASO_PERCENTUAL) {
                                    const value = this.parsePercentual(dataRow[1]);
                                    peicData.CONTAS_EM_ATRASO_PERCENTUAL = value;
                                }
                                // Linha 56: Famílias que não terão condições de pagar
                                else if (dataText.includes('famílias que não terão condições de pagar') &&
                                    !peicData.NÃO_TERAO_CONDICOES_DE_PAGAR_PERCENTUAL) {
                                    const value = this.parsePercentual(dataRow[1]);
                                    peicData.NÃO_TERAO_CONDICOES_DE_PAGAR_PERCENTUAL = value;
                                }
                            }
                        }
                    }
                    break; // Sair do loop após encontrar a seção
                }
            }
        }
    }

    private extractAbsolutoData(jsonData: any[][], peicData: Partial<Peic>): void {
        // Buscar especificamente a seção "PEIC (Síntese)"
        for (let i = 0; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (row && row[0]) {
                const cellText = String(row[0]).toLowerCase();

                // Identificar a seção PEIC (Síntese)
                if (cellText.includes('peic') && cellText.includes('sintese')) {
                    // Processar as próximas linhas desta seção (geralmente linhas 60, 61, 62)
                    for (let j = i + 1; j < Math.min(i + 10, jsonData.length); j++) {
                        const dataRow = jsonData[j];
                        if (dataRow && dataRow[0] && dataRow[1] !== null && dataRow[1] !== undefined) {
                            const dataText = String(dataRow[0]).toLowerCase();

                            // Verificar se é um valor absoluto (números grandes) - valores absolutos são maiores que 1000
                            if (typeof dataRow[1] === 'number' && dataRow[1] > 1000) {
                                // Linha 60: Famílias endividadas (absoluto)
                                if (dataText.includes('famílias endividadas') &&
                                    !dataText.includes('atraso') &&
                                    !dataText.includes('condições') &&
                                    !peicData.ENDIVIDADOS_ABSOLUTO) {
                                    const value = this.parseAbsoluto(dataRow[1]);
                                    peicData.ENDIVIDADOS_ABSOLUTO = value;
                                }
                                // Linha 61: Famílias com conta em Atraso (absoluto)
                                else if (dataText.includes('famílias com conta em atraso') &&
                                    !dataText.includes('condições') &&
                                    !peicData.CONTAS_EM_ATRASO_ABSOLUTO) {
                                    const value = this.parseAbsoluto(dataRow[1]);
                                    peicData.CONTAS_EM_ATRASO_ABSOLUTO = value;
                                }
                                // Linha 62: Famílias que não terão condições de pagar (absoluto)
                                else if (dataText.includes('famílias que não terão condições de pagar') &&
                                    !peicData.NAO_TERÃO_CONDICOES_DE_PAGAR_ABSOLUTO) {
                                    const value = this.parseAbsoluto(dataRow[1]);
                                    peicData.NAO_TERÃO_CONDICOES_DE_PAGAR_ABSOLUTO = value;
                                }
                            }
                        }
                    }
                    break; // Sair do loop após encontrar a seção
                }
            }
        }
    }

    private parsePercentual(value: any): number {
        if (typeof value === 'number') {
            // Converter valores decimais para porcentagem (valores menores que 1 são decimais)
            // Exemplo: 0.578 → 57.8%
            return value < 1 ? Math.round(value * 100 * 10) / 10 : value;
        }

        // Para valores string vindos da tabela HTML (ex: "78,5")
        const strValue = String(value).replace(/[%\s]/g, '').replace(',', '.');
        const num = parseFloat(strValue);

        if (isNaN(num)) {
            return 0;
        }

        // Se o valor já está em formato percentual (>1), manter como está
        // Se está em decimal (<1), converter para percentual
        return num < 1 ? Math.round(num * 100 * 10) / 10 : num;
    }

    private parseAbsoluto(value: any): string {
        if (typeof value === 'number') {
            // Arredondar e formatar com separadores brasileiros (para planilhas)
            return Math.round(value).toLocaleString('pt-BR');
        }

        if (typeof value === 'string') {
            // Tentar converter string para número e depois formatar (para planilhas)
            const cleanValue = value.replace(/[^\d.,]/g, '').replace(',', '.');
            const num = parseFloat(cleanValue);

            if (!isNaN(num)) {
                return Math.round(num).toLocaleString('pt-BR');
            }
        }

        return String(value);
    }

    private parseAbsolutoWebScraping(value: any): string {
        if (typeof value === 'string') {
            // Para web scraping, limpar pontos e vírgulas e converter para número
            const cleanValue = value.replace(/\./g, '').replace(',', '.');
            const num = parseFloat(cleanValue);

            if (!isNaN(num)) {
                return num.toString();
            }
        }

        return String(value);
    }

    private isValidPeicData(data: Partial<Peic>): data is Peic {
        return (
            typeof data.ENDIVIDADOS_PERCENTUAL === 'number' &&
            typeof data.CONTAS_EM_ATRASO_PERCENTUAL === 'number' &&
            typeof data.NÃO_TERAO_CONDICOES_DE_PAGAR_PERCENTUAL === 'number' &&
            typeof data.ENDIVIDADOS_ABSOLUTO === 'string' &&
            typeof data.CONTAS_EM_ATRASO_ABSOLUTO === 'string' &&
            typeof data.NAO_TERÃO_CONDICOES_DE_PAGAR_ABSOLUTO === 'string' &&
            typeof data.MES === 'number' &&
            typeof data.ANO === 'number'
        );
    }

    private async saveToDatabase(data: Peic): Promise<void> {
        try {
            const peicEntity = new Peic();
            peicEntity.ENDIVIDADOS_PERCENTUAL = data.ENDIVIDADOS_PERCENTUAL;
            peicEntity.CONTAS_EM_ATRASO_PERCENTUAL = data.CONTAS_EM_ATRASO_PERCENTUAL;
            peicEntity.NÃO_TERAO_CONDICOES_DE_PAGAR_PERCENTUAL = data.NÃO_TERAO_CONDICOES_DE_PAGAR_PERCENTUAL;
            peicEntity.ENDIVIDADOS_ABSOLUTO = data.ENDIVIDADOS_ABSOLUTO;
            peicEntity.CONTAS_EM_ATRASO_ABSOLUTO = data.CONTAS_EM_ATRASO_ABSOLUTO;
            peicEntity.NAO_TERÃO_CONDICOES_DE_PAGAR_ABSOLUTO = data.NAO_TERÃO_CONDICOES_DE_PAGAR_ABSOLUTO;
            peicEntity.MES = data.MES;
            peicEntity.ANO = data.ANO;
            peicEntity.REGIAO = data.REGIAO;
            peicEntity.METODO = data.METODO;

            await peicRepository.save(peicEntity);
        } catch (error) {
            throw new Error(`Erro ao salvar PEIC no banco: ${error}`);
        }
    }

    // Método público para teste
    public async testSinglePeriod(mes: number, ano: number, regiao: string = 'BR'): Promise<void> {
        try {
            console.log(LogMessages.teste('PEIC', regiao, mes, ano));

            const filePath = await this.downloadFile(mes, ano, regiao);
            const data = await this.extractDataFromExcel(filePath, mes, ano, regiao);

            console.log('📈 Dados extraídos:', data);

            await this.saveToDatabase(data);
            // Arquivo será limpo ao final da execução

            console.log(LogMessages.sucesso('PEIC', regiao, mes, ano));

        } catch (error) {
            console.log(LogMessages.erro('PEIC', regiao, mes, ano, error));
            throw error;
        }
    }

    // Método público para testar web scraping
    public async testWebScrapingSinglePeriod(mes: number, ano: number, regiao: string = 'BR'): Promise<void> {
        const browser = await chromium.launch({ headless: false });

        try {
            const page = await browser.newPage();

            // Fazer login
            await this.performLogin(page);

            console.log(`🌐 Testando web scraping para ${regiao} ${mes.toString().padStart(2, '0')}/${ano}`);

            const data = await this.extractDataFromWebsite(page, mes, ano, regiao);
            await this.saveToDatabase(data);

            console.log(`✅ Web scraping bem-sucedido: ${regiao} ${mes.toString().padStart(2, '0')}/${ano}`);
            console.log('📈 Dados salvos:', data);

        } catch (error) {
            console.log(`❌ Falha no web scraping: ${regiao} ${mes.toString().padStart(2, '0')}/${ano} - ${error}`);
            throw error;
        } finally {
            await browser.close();
        }
    }

    private async retryWithWebScraping(errorList: IErrorService[]): Promise<void> {
        const browser = await chromium.launch({ headless: false });

        try {
            const page = await browser.newPage();

            // Fazer login
            await this.performLogin(page);

            let sucessosWebScraping = 0;
            let errosWebScraping = 0;

            for (const error of errorList) {
                try {
                    console.log(`🌐 Tentando web scraping para ${error.regiao} ${error.mes.toString().padStart(2, '0')}/${error.ano}`);

                    const data = await this.extractDataFromWebsite(page, error.mes, error.ano, error.regiao);
                    await this.saveToDatabase(data);

                    console.log(`✅ Web scraping bem-sucedido: ${error.regiao} ${error.mes.toString().padStart(2, '0')}/${error.ano}`);
                    sucessosWebScraping++;

                } catch (scrapingError) {
                    console.log(`❌ Falha no web scraping: ${error.regiao} ${error.mes.toString().padStart(2, '0')}/${error.ano} - ${scrapingError}`);
                    errosWebScraping++;
                }
            }

            console.log(`\n=== Resultado do Web Scraping ===`);
            console.log(`Sucessos: ${sucessosWebScraping}`);
            console.log(`Erros: ${errosWebScraping}`);
            console.log(`Total tentativas: ${errorList.length}`);

        } finally {
            await browser.close();
        }
    }

    /**
     * Versão com monitoramento do retry por web scraping para PEIC
     */
    private async retryWithWebScrapingMonitoring(errorList: IErrorService[], tasks: ITask[]): Promise<number> {
        const browser = await chromium.launch({ headless: false });

        try {
            const page = await browser.newPage();

            // Fazer login
            await this.performLogin(page);

            let sucessosWebScraping = 0;

            for (const error of errorList) {
                try {
                    console.log(`🌐 Tentando web scraping para PEIC ${error.regiao} ${error.mes.toString().padStart(2, '0')}/${error.ano}`);

                    const data = await this.extractDataFromWebsite(page, error.mes, error.ano, error.regiao);
                    await this.saveToDatabase(data);

                    console.log(`✅ Web scraping bem-sucedido: PEIC ${error.regiao} ${error.mes.toString().padStart(2, '0')}/${error.ano}`);
                    sucessosWebScraping++;

                    // Atualizar task correspondente para sucesso
                    const taskIndex = tasks.findIndex(t => 
                        t.mes === error.mes && 
                        t.ano === error.ano && 
                        t.regiao === error.regiao && 
                        t.status === 'Falha'
                    );
                    
                    if (taskIndex !== -1) {
                        tasks[taskIndex].status = 'Sucesso';
                        tasks[taskIndex].metodo = Metodo.WS;
                        delete tasks[taskIndex].erro;
                    }

                } catch (scrapingError) {
                    console.log(`❌ Falha no web scraping: PEIC ${error.regiao} ${error.mes.toString().padStart(2, '0')}/${error.ano} - ${scrapingError}`);
                    
                    // Atualizar erro na task
                    const taskIndex = tasks.findIndex(t => 
                        t.mes === error.mes && 
                        t.ano === error.ano && 
                        t.regiao === error.regiao && 
                        t.status === 'Falha'
                    );
                    
                    if (taskIndex !== -1) {
                        tasks[taskIndex].erro = `Planilha: ${tasks[taskIndex].erro} | Web Scraping: ${scrapingError}`;
                    }
                }
            }

            console.log(`\n=== Resultado do Web Scraping PEIC ===`);
            console.log(`Sucessos: ${sucessosWebScraping}`);
            console.log(`Erros: ${errorList.length - sucessosWebScraping}`);
            console.log(`Total tentativas: ${errorList.length}`);

            return sucessosWebScraping;

        } finally {
            await browser.close();
        }
    }

    private async performLogin(page: any): Promise<void> {
        console.log('🔐 Fazendo login no site...');

        const baseUrl = process.env.BASE_URL_SITE_PEIC || 'https://pesquisascnc.com.br/pesquisa-peic/';

        await page.goto(baseUrl);
        console.log('✅ Página carregada');

        // Aguardar os campos de login aparecerem
        await page.waitForSelector('#log');
        await page.waitForSelector('#pwd');

        // Preencher credenciais usando os IDs corretos
        await page.fill('#log', process.env.CREDENTIALS_USER || '');
        console.log('✅ Email preenchido');

        await page.fill('#pwd', process.env.CREDENTIALS_PASSWORD || '');
        console.log('✅ Senha preenchida');

        // Clicar no botão de login usando o ID correto
        await page.click('#actionLogin');
        console.log('✅ Login realizado');

        // Aguardar o formulário de pesquisa aparecer (confirma que o login foi bem-sucedido)
        await page.waitForSelector('#formPesquisa', { timeout: 10000 });
        console.log('✅ Login confirmado - formulário de pesquisa carregado');
    }

    private async extractDataFromWebsite(page: any, mes: number, ano: number, regiao: string): Promise<Peic> {
        console.log(`📊 Extraindo dados do site para ${regiao} ${mes}/${ano}`);

        // Aguardar o formulário de pesquisa estar disponível
        await page.waitForSelector('#formPesquisa');

        // Selecionar ano
        await page.locator('#selectAno').selectOption(ano.toString());
        console.log(`✅ Ano selecionado: ${ano}`);

        // Selecionar mês (sem zero à esquerda)
        await page.locator('#selectMes').selectOption(mes.toString());
        console.log(`✅ Mês selecionado: ${mes}`);

        // Selecionar região/estado
        await page.locator('#selectEstado').selectOption(regiao);
        console.log(`✅ Região selecionada: ${regiao}`);

        // Clicar no botão Filtrar
        await page.getByRole('button', { name: 'Filtrar' }).click();
        console.log('✅ Botão Filtrar clicado');

        // Aguardar a tabela carregar dentro do iframe
        await page.waitForTimeout(3000);

        // Buscar a tabela dentro do iframe #dadosPesquisa
        const table = await page.frameLocator('#dadosPesquisa').getByRole('table');
        console.log('✅ Tabela encontrada no iframe');

        // Aguardar um pouco mais para garantir que a tabela carregou completamente
        await page.waitForTimeout(1000);

        // Extrair dados da tabela
        const tableData = await this.extractTableData(page, mes, ano);

        const peicData: Peic = {
            MES: mes,
            ANO: ano,
            REGIAO: regiao as Regiao,
            METODO: Metodo.WS,
            ENDIVIDADOS_PERCENTUAL: tableData.ENDIVIDADOS_PERCENTUAL,
            CONTAS_EM_ATRASO_PERCENTUAL: tableData.CONTAS_EM_ATRASO_PERCENTUAL,
            NÃO_TERAO_CONDICOES_DE_PAGAR_PERCENTUAL: tableData.NÃO_TERAO_CONDICOES_DE_PAGAR_PERCENTUAL,
            ENDIVIDADOS_ABSOLUTO: tableData.ENDIVIDADOS_ABSOLUTO,
            CONTAS_EM_ATRASO_ABSOLUTO: tableData.CONTAS_EM_ATRASO_ABSOLUTO,
            NAO_TERÃO_CONDICOES_DE_PAGAR_ABSOLUTO: tableData.NAO_TERÃO_CONDICOES_DE_PAGAR_ABSOLUTO
        };

        console.log('📈 Dados extraídos:', tableData);
        return peicData;
    }

    private async extractTableData(page: any, mes: number, ano: number): Promise<any> {
        // Mapear mês para formato abreviado em inglês (JUL 25)
        const meses = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const mesAbrev = meses[mes - 1];
        const anoAbrev = ano.toString().slice(-2); // Pegar últimos 2 dígitos
        const periodoTarget = `${mesAbrev} ${anoAbrev}`;

        console.log(`🔍 Procurando período: ${periodoTarget}`);

        try {
            // Usar abordagem similar ao código legado do ICEC
            const table = await page.frameLocator('#dadosPesquisa').getByRole('table');
            const rows = await table.locator('tr');

            // Extrair todos os dados da tabela
            const data = await rows.allInnerTexts();
            console.log(`✅ Dados extraídos: ${data.length} linhas`);

            // Filtrar e processar os dados
            for (let i = 0; i < data.length; i++) {
                const rowData = data[i];
                if (rowData && rowData.includes(periodoTarget)) {
                    console.log(`✅ Período encontrado: ${periodoTarget}`);
                    console.log(`📊 Dados da linha: ${rowData}`);

                    // Dividir por tab ou espaços múltiplos
                    const values = rowData.split(/\t+/).filter(val => val.trim() !== '');

                    console.log('📊 Valores separados:', values);

                    // Validar se temos pelo menos 7 valores (período + 6 dados)
                    if (values.length < 7) {
                        console.log('⚠️ Tentando separação alternativa por espaços múltiplos');
                        const altValues = rowData.split(/\s{2,}/).filter(val => val.trim() !== '');
                        console.log('📊 Valores alternativos:', altValues);

                        if (altValues.length >= 7) {
                            return this.processTableValues(altValues.slice(1)); // Pular a primeira coluna (período)
                        } else {
                            throw new Error(`Dados insuficientes na tabela. Esperado: 7 valores, Encontrado: ${altValues.length}`);
                        }
                    }

                    return this.processTableValues(values.slice(1)); // Pular a primeira coluna (período)
                }
            }

            // Se não encontrou o período, mostrar períodos disponíveis
            console.log('🔍 Períodos disponíveis na tabela:');
            data.forEach((rowData, index) => {
                if (rowData && rowData.trim()) {
                    const firstValue = rowData.split(/[\t\s]+/)[0];
                    if (firstValue && firstValue.match(/[A-Z]{3}\s?\d{2}/)) {
                        console.log(`   - "${firstValue.trim()}"`);
                    }
                }
            });

            throw new Error(`Período ${periodoTarget} não encontrado na tabela`);

        } catch (error) {
            console.error('❌ Erro ao extrair dados da tabela:', error);
            throw error;
        }
    }

    private processTableValues(values: string[]): any {
        console.log('🔄 Processando valores:', values);

        if (values.length < 6) {
            throw new Error(`Dados insuficientes. Esperado: 6 valores, Encontrado: ${values.length}`);
        }

        return {
            ENDIVIDADOS_PERCENTUAL: this.parsePercentual(values[0]),
            CONTAS_EM_ATRASO_PERCENTUAL: this.parsePercentual(values[1]),
            NÃO_TERAO_CONDICOES_DE_PAGAR_PERCENTUAL: this.parsePercentual(values[2]),
            ENDIVIDADOS_ABSOLUTO: this.parseAbsolutoWebScraping(values[3]),
            CONTAS_EM_ATRASO_ABSOLUTO: this.parseAbsolutoWebScraping(values[4]),
            NAO_TERÃO_CONDICOES_DE_PAGAR_ABSOLUTO: this.parseAbsolutoWebScraping(values[5])
        };
    }
}

export const peicService = new PeicService();
