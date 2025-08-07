import axios from 'axios';
import * as XLSX from 'xlsx';
import * as fs from 'fs-extra';
import * as path from 'path';
import { chromium } from 'playwright';
import { Icec } from '../database/entities/Icec';
import { icecRepository } from '../database/repositories/icecRepository';
import { Regiao, Metodo, IErrorService, ITask, IServiceResult } from '../shared/interfaces';
import { 
    generateServicePeriods,
    extractServicePeriodRange,
    formatPeriod, 
    formatPeriodDisplay, 
    calculateExecutionTime, 
    calculateTaskStats, 
    cleanupServiceTempFolder,
    LogMessages
} from '../shared/utils';

export class IcecService {
    private readonly TEMP_DIR = path.join(__dirname, '../../../temp');
    private baseUrl = process.env.BASE_URL || 'https://backend.pesquisascnc.com.br/admin/4/upload';

    /**
     * Versão com monitoramento do processamento ICEC
     */
    public async processAllIcecDataWithMonitoring(regioes: string[] = ['BR']): Promise<IServiceResult> {
        const startTime = Date.now();
        console.log('🚀 Iniciando processamento completo dos dados ICEC com monitoramento...\n');

        const resultadoLimpeza = await this.cleanDatabase();
        console.log(resultadoLimpeza);

        console.log(`📍 Regiões a processar: ${regioes.join(', ')}\n`);

        const periods = generateServicePeriods('ICEC');
        const tasks: ITask[] = [];
        let registrosPlanilha = 0;
        let registrosWebScraping = 0;
        let erros: IErrorService[] = [];

        // Primeira tentativa com download de planilhas
        for (const period of periods) {
            for (const regiao of regioes) {
                try {
                    console.log(LogMessages.processando('ICEC', regiao, period.mes, period.ano));

                    const filePath = await this.downloadFile(period.mes, period.ano, regiao);
                    const data = await this.extractDataFromExcel(filePath, period.mes, period.ano, regiao);
                    await this.saveToDatabase(data);
                    // Arquivo será limpo ao final da execução

                    console.log(LogMessages.sucesso('ICEC', regiao, period.mes, period.ano));
                    
                    tasks.push({
                        mes: period.mes,
                        ano: period.ano,
                        regiao,
                        status: 'Sucesso',
                        servico: 'ICEC',
                        metodo: Metodo.PLA
                    });
                    
                    registrosPlanilha++;

                } catch (error) {
                    console.log(LogMessages.erro('ICEC', regiao, period.mes, period.ano, error));
                    
                    tasks.push({
                        mes: period.mes,
                        ano: period.ano,
                        regiao,
                        status: 'Falha',
                        servico: 'ICEC',
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

        // Extrair períodos dinamicamente
        const { periodoInicio, periodoFim } = extractServicePeriodRange(periods);

        const resultado: IServiceResult = {
            servico: 'ICEC',
            periodoInicio,
            periodoFim,
            tempoExecucao,
            tasks,
            totalRegistros: tasks.length, // Total geral (sucessos + falhas)
            registrosPlanilha,
            registrosWebScraping,
            sucessos,
            falhas
        };

        console.log(`\n=== Processamento ICEC concluído ===`);
        console.log(`Sucessos: ${sucessos}`);
        console.log(`Falhas: ${falhas}`);
        console.log(`Tempo: ${Math.round(tempoExecucao / 60)} minutos`);
        console.log(`Registros por planilha: ${registrosPlanilha}`);
        console.log(`Registros por web scraping: ${registrosWebScraping}`);

        // Limpeza da pasta temp ao final da execução
        await cleanupServiceTempFolder('icec', this.TEMP_DIR);

        return resultado;
    }

    public async processAllIcecData(regioes: string[] = ['BR']): Promise<void> {
        console.log('🚀 Iniciando processamento completo dos dados ICEC...\n');

        const resultadoLimpeza = await this.cleanDatabase();
        console.log(resultadoLimpeza);

        console.log(`📍 Regiões a processar: ${regioes.join(', ')}\n`);

        const periods = generateServicePeriods('ICEC');
        let processados = 0;
        let sucessos = 0;
        let erros: IErrorService[] = [];
        const totalProcessos = periods.length * regioes.length;

        for (const period of periods) {
            for (const regiao of regioes) {
                try {
                    console.log(LogMessages.processando('ICEC', regiao, period.mes, period.ano));

                    const filePath = await this.downloadFile(period.mes, period.ano, regiao);
                    const data = await this.extractDataFromExcel(filePath, period.mes, period.ano, regiao);
                    await this.saveToDatabase(data);
                    // Arquivo será limpo ao final da execução

                    console.log(LogMessages.sucesso('ICEC', regiao, period.mes, period.ano));
                    sucessos++;

                } catch (error) {
                    console.log(LogMessages.erro('ICEC', regiao, period.mes, period.ano, error));
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
                console.log(`   ❌ ${formatPeriodDisplay(erro.regiao, erro.mes, erro.ano)}`);
            });

            // Segunda tentativa com web scraping
            console.log(`\n🔄 Iniciando segunda tentativa com web scraping...`);
            await this.retryWithWebScraping(erros);
        }
    }

    public async testSinglePeriod(mes: number, ano: number, regiao: string = 'BR'): Promise<void> {
        try {
            console.log(LogMessages.teste('ICEC', regiao, mes, ano));

            const filePath = await this.downloadFile(mes, ano, regiao);
            const data = await this.extractDataFromExcel(filePath, mes, ano, regiao);
            
            console.log('📈 Dados extraídos:', data);
            
            await this.saveToDatabase(data);
            // Arquivo será limpo ao final da execução

            console.log(LogMessages.sucesso('ICEC', regiao, mes, ano));

        } catch (error) {
            console.log(LogMessages.erro('ICEC', regiao, mes, ano, error));
            throw error;
        }
    }

    private async cleanDatabase(): Promise<string> {
        try {
            await icecRepository.clear();

            return '✅ Base de dados ICEC limpa com sucesso\n';

        } catch (error) {
            return `Erro ao limpar a base de dados ICEC: ${error}\n`;
        }
    }

    private buildUrl(mes: number, ano: number, regiao: string = 'BR'): string {
        return `${this.baseUrl}/${mes}_${ano}/ICEC/${regiao}.xls`;
    }

    private async downloadFile(mes: number, ano: number, regiao: string = 'BR'): Promise<string> {
        try {
            const url = this.buildUrl(mes, ano, regiao);
            const response = await axios.get(url, { responseType: 'stream' });

            const tempDir = path.join(process.cwd(), 'temp');
            await fs.ensureDir(tempDir);

            const filePath = path.join(tempDir, `icec_${regiao}_${mes}_${ano}.xls`);
            const writer = fs.createWriteStream(filePath);

            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', () => resolve(filePath));
                writer.on('error', reject);
            });
        } catch (error) {
            throw new Error(`Erro ao baixar arquivo ICEC: ${error}`);
        }
    }

    private async extractDataFromExcel(filePath: string, mes: number, ano: number, regiao: string = 'BR'): Promise<Icec> {
        try {
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null }) as any[][];

            // Buscar linha com 'Índice (em Pontos)' - que é a última linha do ICEC
            let icecRow: any[] | null = null;
            
            for (let i = jsonData.length - 1; i >= 0; i--) {
                const row = jsonData[i];
                if (row && row[0]) {
                    const cellValue = row[0].toString().toLowerCase();
                    if (cellValue.includes('índice (em pontos)')) {
                        icecRow = row;
                        break;
                    }
                }
            }

            if (!icecRow) {
                throw new Error('Linha com dados ICEC não encontrada');
            }

            // Extrair valores numéricos (colunas 1-6: Total, Até 50, Mais de 50, Semiduráveis, Não duráveis, Duráveis)
            const numericData = icecRow.slice(1, 7).map(val => {
                const num = parseFloat(String(val || '0').replace(',', '.'));
                return isNaN(num) ? 0 : num;
            });

            return {
                ICEC: numericData[0],
                ATÉ_50: numericData[1],
                MAIS_DE_50: numericData[2],
                SEMIDURAVEIS: numericData[3],
                NAO_DURAVEIS: numericData[4],
                DURAVEIS: numericData[5],
                MES: mes,
                ANO: ano,
                REGIAO: regiao as Regiao,
                METODO: Metodo.PLA
            };
        } catch (error) {
            throw new Error(`Erro ao processar arquivo ICEC: ${error}`);
        }
    }

    private async saveToDatabase(data: Icec): Promise<void> {
        try {
            const icecEntity = new Icec();
            icecEntity.ICEC = data.ICEC;
            icecEntity.ATÉ_50 = data.ATÉ_50;
            icecEntity.MAIS_DE_50 = data.MAIS_DE_50;
            icecEntity.SEMIDURAVEIS = data.SEMIDURAVEIS;
            icecEntity.NAO_DURAVEIS = data.NAO_DURAVEIS;
            icecEntity.DURAVEIS = data.DURAVEIS;
            icecEntity.MES = data.MES;
            icecEntity.ANO = data.ANO;
            icecEntity.REGIAO = data.REGIAO;
            icecEntity.METODO = data.METODO;

            await icecRepository.save(icecEntity);
        } catch (error) {
            throw new Error(`Erro ao salvar ICEC no banco: ${error}`);
        }
    }

    // Método público para testar web scraping
    public async testWebScrapingSinglePeriod(mes: number, ano: number, regiao: string = 'BR'): Promise<void> {
        const browser = await chromium.launch({ headless: false });

        try {
            const page = await browser.newPage();

            // Fazer login
            await this.performLogin(page);

            console.log(LogMessages.webScrapingInicio('ICEC', regiao, mes, ano));

            const data = await this.extractDataFromWebsite(page, mes, ano, regiao);
            await this.saveToDatabase(data);

            console.log(LogMessages.webScrapingSucesso('ICEC', regiao, mes, ano));
            console.log('📈 Dados salvos:', data);

        } catch (error) {
            console.log(LogMessages.webScrapingFalha('ICEC', regiao, mes, ano, error));
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
                    console.log(LogMessages.webScrapingInicio('ICEC', error.regiao, error.mes, error.ano));

                    const data = await this.extractDataFromWebsite(page, error.mes, error.ano, error.regiao);
                    await this.saveToDatabase(data);

                    console.log(LogMessages.webScrapingSucesso('ICEC', error.regiao, error.mes, error.ano));
                    sucessosWebScraping++;

                } catch (scrapingError) {
                    console.log(LogMessages.webScrapingFalha('ICEC', error.regiao, error.mes, error.ano, scrapingError));
                    errosWebScraping++;
                }
            }

            console.log(`\n=== Resultado do Web Scraping ICEC ===`);
            console.log(`Sucessos: ${sucessosWebScraping}`);
            console.log(`Erros: ${errosWebScraping}`);
            console.log(`Total tentativas: ${errorList.length}`);

        } finally {
            await browser.close();
        }
    }

    /**
     * Versão com monitoramento do retry por web scraping
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
                    console.log(LogMessages.webScrapingInicio('ICEC', error.regiao, error.mes, error.ano));

                    const data = await this.extractDataFromWebsite(page, error.mes, error.ano, error.regiao);
                    await this.saveToDatabase(data);

                    console.log(LogMessages.webScrapingSucesso('ICEC', error.regiao, error.mes, error.ano));
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
                    console.log(LogMessages.webScrapingFalha('ICEC', error.regiao, error.mes, error.ano, scrapingError));
                    
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

            console.log(`\n=== Resultado do Web Scraping ICEC ===`);
            console.log(`Sucessos: ${sucessosWebScraping}`);
            console.log(`Erros: ${errorList.length - sucessosWebScraping}`);
            console.log(`Total tentativas: ${errorList.length}`);

            return sucessosWebScraping;

        } finally {
            await browser.close();
        }
    }

    private async performLogin(page: any): Promise<void> {
        console.log('🔐 Fazendo login no site ICEC...');

        const baseUrl = process.env.BASE_URL_SITE_ICEC || 'https://pesquisascnc.com.br/pesquisa-icec/';

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

    private async extractDataFromWebsite(page: any, mes: number, ano: number, regiao: string): Promise<Icec> {
        console.log(`📊 Extraindo dados do site ICEC para ${regiao} ${mes}/${ano}`);

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

        const icecData: Icec = {
            MES: mes,
            ANO: ano,
            REGIAO: regiao as Regiao,
            METODO: Metodo.WS,
            ICEC: tableData.ICEC,
            ATÉ_50: tableData.ATÉ_50,
            MAIS_DE_50: tableData.MAIS_DE_50,
            SEMIDURAVEIS: tableData.SEMIDURAVEIS,
            NAO_DURAVEIS: tableData.NAO_DURAVEIS,
            DURAVEIS: tableData.DURAVEIS
        };

        console.log('📈 Dados extraídos:', tableData);
        return icecData;
    }

    private async extractTableData(page: any, mes: number, ano: number): Promise<any> {
        // Mapear mês para formato abreviado em inglês (JUL 25)
        const meses = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const mesAbrev = meses[mes - 1];
        const anoAbrev = ano.toString().slice(-2); // Pegar últimos 2 dígitos
        const periodoTarget = `${mesAbrev} ${anoAbrev}`;

        console.log(`🔍 Procurando período ICEC: ${periodoTarget}`);

        try {
            // Usar abordagem similar ao código do PEIC
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

                    // Validar se temos pelo menos 7 valores (período + 6 dados ICEC)
                    if (values.length < 7) {
                        console.log('⚠️ Tentando separação alternativa por espaços múltiplos');
                        const altValues = rowData.split(/\s{2,}/).filter(val => val.trim() !== '');
                        console.log('📊 Valores alternativos:', altValues);

                        if (altValues.length >= 7) {
                            return this.processIcecTableValues(altValues.slice(1)); // Pular a primeira coluna (período)
                        } else {
                            throw new Error(`Dados insuficientes na tabela ICEC. Esperado: 7 valores, Encontrado: ${altValues.length}`);
                        }
                    }

                    return this.processIcecTableValues(values.slice(1)); // Pular a primeira coluna (período)
                }
            }

            // Se não encontrou o período, mostrar períodos disponíveis
            console.log('🔍 Períodos disponíveis na tabela ICEC:');
            data.forEach((rowData, index) => {
                if (rowData && rowData.trim()) {
                    const firstValue = rowData.split(/[\t\s]+/)[0];
                    if (firstValue && firstValue.match(/[A-Z]{3}\s?\d{2}/)) {
                        console.log(`   - "${firstValue.trim()}"`);
                    }
                }
            });

            throw new Error(`Período ${periodoTarget} não encontrado na tabela ICEC`);

        } catch (error) {
            console.error('❌ Erro ao extrair dados da tabela ICEC:', error);
            throw error;
        }
    }

    private processIcecTableValues(values: string[]): any {
        console.log('🔄 Processando valores ICEC:', values);

        if (values.length < 6) {
            throw new Error(`Dados ICEC insuficientes. Esperado: 6 valores, Encontrado: ${values.length}`);
        }

        // Parsear valores numéricos do ICEC (formato brasileiro com vírgula)
        const parseIcecValue = (value: string): number => {
            const cleanValue = String(value).replace(',', '.');
            const num = parseFloat(cleanValue);
            return isNaN(num) ? 0 : num;
        };

        return {
            ICEC: parseIcecValue(values[0]),           // 104,1
            ATÉ_50: parseIcecValue(values[1]),         // 104,0  
            MAIS_DE_50: parseIcecValue(values[2]),     // 108,0
            SEMIDURAVEIS: parseIcecValue(values[3]),   // 111,1
            NAO_DURAVEIS: parseIcecValue(values[4]),   // 103,4
            DURAVEIS: parseIcecValue(values[5])        // 100,6
        };
    }
}