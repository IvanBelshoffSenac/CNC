import axios from 'axios';
import * as XLSX from 'xlsx';
import * as fs from 'fs-extra';
import * as path from 'path';
import { chromium } from 'playwright';
import { icfRepository } from '../database/repositories';
import { Icf } from '../database/entities';
import { Regiao, Metodo, IErrorService } from '../shared/interfaces';

interface IcfPontosData {
    NC_PONTOS: number;
    ATE_10_SM_PONTOS: number;
    MAIS_DE_10_SM_PONTOS: number;
}

export class IcfService {
    private readonly TEMP_DIR = path.join(__dirname, '../../../temp');
    private readonly TIMEOUT = 30000;
    private baseUrl = process.env.BASE_URL || 'https://backend.pesquisascnc.com.br/admin/4/upload';

    constructor() {
        this.ensureTempDirectory();
    }

    public async testSinglePeriod(mes: number, ano: number, regiao: string = 'BR'): Promise<void> {
        try {
            console.log(`📊 Testando ICF ${regiao} ${mes.toString().padStart(2, '0')}/${ano}`);

            const currentUrl = this.buildUrl(mes, ano, regiao);
            const currentFilePath = await this.downloadExcelFile(currentUrl, `${regiao}_${mes}_${ano}`);
            const currentData = await this.extractPointsFromExcel(currentFilePath);

            const previousPeriod = this.getPreviousPeriod(mes, ano);
            let icfData: Icf;

            if (previousPeriod) {
                const previousUrl = this.buildUrl(previousPeriod.mes, previousPeriod.ano, regiao);
                const previousFilePath = await this.downloadExcelFile(previousUrl, `${regiao}_${previousPeriod.mes}_${previousPeriod.ano}`);
                const previousData = await this.extractPointsFromExcel(previousFilePath);
                icfData = this.calculatePercentages(currentData, previousData);
                await this.cleanupTempFiles([previousFilePath]);
            } else {
                icfData = this.calculatePercentages(currentData, { NC_PONTOS: 0, ATE_10_SM_PONTOS: 0, MAIS_DE_10_SM_PONTOS: 0 });
            }

            icfData.MES = mes;
            icfData.ANO = ano;
            icfData.REGIAO = regiao as Regiao;

            console.log('📈 Dados extraídos:', icfData);

            await this.saveToDatabase(icfData);
            await this.cleanupTempFiles([currentFilePath]);

            console.log(`✅ ICF ${regiao} ${mes.toString().padStart(2, '0')}/${ano} processado com sucesso`);

        } catch (error) {
            console.log(`❌ Erro ao processar ICF ${regiao} ${mes.toString().padStart(2, '0')}/${ano}: ${error}`);
            throw error;
        }
    }

    private async ensureTempDirectory(): Promise<void> {
        try {
            await fs.ensureDir(this.TEMP_DIR);
        } catch (error) {
            throw new Error(`Erro ao criar diretório temporário: ${error}`);
        }
    }

    private buildUrl(mes: number, ano: number, regiao: string = 'BR'): string {
        return `${this.baseUrl}/${mes}_${ano}/ICF/${regiao}.xls`;
    }

    private async downloadExcelFile(url: string, identifier: string): Promise<string> {
        const fileName = `icf_${identifier}_${Date.now()}.xls`;
        const filePath = path.join(this.TEMP_DIR, fileName);

        try {
            const response = await axios({
                method: 'GET',
                url: url,
                responseType: 'stream',
                timeout: this.TIMEOUT,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const writer = fs.createWriteStream(filePath);
            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', () => resolve(filePath));
                writer.on('error', reject);
            });
        } catch (error) {
            throw new Error(`Erro ao baixar arquivo ICF (${identifier}): ${error}`);
        }
    }

    private async extractPointsFromExcel(filePath: string): Promise<IcfPontosData> {
        try {
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null }) as any[][];

            let lastValidRow: any[] | null = null;

            for (let i = jsonData.length - 1; i >= 0; i--) {
                const row = jsonData[i];
                if (row && Array.isArray(row) && row.length >= 4) {
                    const firstCell = String(row[0] || '').toLowerCase().trim();
                    if (firstCell.includes('índice (em pontos)')) {
                        const numericValues = row.slice(1, 4).map(val => {
                            const num = parseFloat(String(val || '0').replace(',', '.'));
                            return isNaN(num) ? 0 : num;
                        });

                        if (numericValues.some(val => val > 0)) {
                            lastValidRow = row;
                            break;
                        }
                    }
                }
            }

            if (!lastValidRow) {
                throw new Error('Linha com dados ICF não encontrada');
            }

            const numericData = lastValidRow.slice(1, 4).map(val => {
                const num = parseFloat(String(val || '0').replace(',', '.'));
                return isNaN(num) ? 0 : num;
            });

            return {
                NC_PONTOS: numericData[0],
                ATE_10_SM_PONTOS: numericData[1],
                MAIS_DE_10_SM_PONTOS: numericData[2]
            };
        } catch (error) {
            throw new Error(`Erro ao processar arquivo Excel ICF: ${error}`);
        }
    }

    private calculatePercentages(currentData: IcfPontosData, previousData: IcfPontosData): Icf {
        const calculatePercentage = (current: number, previous: number): number => {
            if (previous === 0) return 0;
            const percentage = ((current - previous) / previous) * 100;
            return Math.round(percentage * 10) / 10;
        };

        return {
            NC_PONTOS: currentData.NC_PONTOS,
            ATE_10_SM_PONTOS: currentData.ATE_10_SM_PONTOS,
            MAIS_DE_10_SM_PONTOS: currentData.MAIS_DE_10_SM_PONTOS,
            NC_PERCENTUAL: calculatePercentage(currentData.NC_PONTOS, previousData.NC_PONTOS),
            ATE_10_SM_PERCENTUAL: calculatePercentage(currentData.ATE_10_SM_PONTOS, previousData.ATE_10_SM_PONTOS),
            MAIS_DE_10_SM_PERCENTUAL: calculatePercentage(currentData.MAIS_DE_10_SM_PONTOS, previousData.MAIS_DE_10_SM_PONTOS),
            MES: 0,
            ANO: 0,
            REGIAO: Regiao.BR, // Valor padrão, será sobrescrito
            METODO: Metodo.PLA // Valor padrão para planilhas
        };
    }

    private async saveToDatabase(data: Icf): Promise<void> {
        try {
            const icfEntity = new Icf();
            icfEntity.NC_PONTOS = data.NC_PONTOS;
            icfEntity.ATE_10_SM_PONTOS = data.ATE_10_SM_PONTOS;
            icfEntity.MAIS_DE_10_SM_PONTOS = data.MAIS_DE_10_SM_PONTOS;
            icfEntity.NC_PERCENTUAL = data.NC_PERCENTUAL;
            icfEntity.ATE_10_SM_PERCENTUAL = data.ATE_10_SM_PERCENTUAL;
            icfEntity.MAIS_DE_10_SM_PERCENTUAL = data.MAIS_DE_10_SM_PERCENTUAL;
            icfEntity.MES = data.MES;
            icfEntity.ANO = data.ANO;
            icfEntity.REGIAO = data.REGIAO;
            icfEntity.METODO = data.METODO;

            await icfRepository.save(icfEntity);
        } catch (error) {
            throw new Error(`Erro ao salvar ICF no banco: ${error}`);
        }
    }

    private async cleanupTempFiles(filePaths: string[]): Promise<void> {
        for (const filePath of filePaths) {
            try {
                await fs.remove(filePath);
            } catch (error) {
                console.warn(`Aviso: não foi possível remover arquivo temporário: ${filePath}`);
            }
        }
    }

    private generatePeriods(): Array<{ mes: number, ano: number }> {
        const periods: Array<{ mes: number; ano: number }> = [];
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1;

        // Janeiro 2010 até período atual
        for (let ano = 2010; ano <= currentYear; ano++) {
            const startMonth = ano === 2010 ? 1 : 1;
            const endMonth = ano === currentYear ? currentMonth : 12;

            for (let mes = startMonth; mes <= endMonth; mes++) {
                periods.push({ mes, ano });
            }
        }
        return periods;
    }

    private getPreviousPeriod(mes: number, ano: number): { mes: number, ano: number } {
        if (mes === 1) {
            return { mes: 12, ano: ano - 1 };
        }
        return { mes: mes - 1, ano };
    }

    private async cleanDatabase(): Promise<string> {
        try {
            await icfRepository.clear();

            return '✅ Base de dados ICF limpa com sucesso\n';

        } catch (error) {
            return `Erro ao limpar a base de dados ICF: ${error}\n`;
        }
    }

    public async processAllIcfData(regioes: string[] = ['BR']): Promise<void> {
        console.log('🚀 Iniciando processamento completo dos dados ICF...\n');

        const resultadoLimpeza = await this.cleanDatabase();
        console.log(resultadoLimpeza);

        console.log(`📍 Regiões a processar: ${regioes.join(', ')}\n`);

        const periods = this.generatePeriods();

        console.log(periods);

        let processados = 0;
        let sucessos = 0;
        let erros: IErrorService[] = [];
        const totalProcessos = periods.length * regioes.length;

        for (const period of periods) {
            for (const regiao of regioes) {
                const tempFilePaths: string[] = [];

                try {
                    console.log(`Processando período: ${regiao} ${period.mes.toString().padStart(2, '0')}/${period.ano}`);

                    const previousPeriod = this.getPreviousPeriod(period.mes, period.ano);

                    const currentUrl = this.buildUrl(period.mes, period.ano, regiao);
                    const previousUrl = this.buildUrl(previousPeriod.mes, previousPeriod.ano, regiao);

                    const [currentFilePath, previousFilePath] = await Promise.all([
                        this.downloadExcelFile(currentUrl, `${regiao}_atual`),
                        this.downloadExcelFile(previousUrl, `${regiao}_anterior`)
                    ]);

                    tempFilePaths.push(currentFilePath, previousFilePath);

                    const [currentData, previousData] = await Promise.all([
                        this.extractPointsFromExcel(currentFilePath),
                        this.extractPointsFromExcel(previousFilePath)
                    ]);

                    const completeData = this.calculatePercentages(currentData, previousData);
                    completeData.MES = period.mes;
                    completeData.ANO = period.ano;
                    completeData.REGIAO = regiao as Regiao;

                    await this.saveToDatabase(completeData);

                    console.log(`✅ Período ${regiao} ${period.mes.toString().padStart(2, '0')}/${period.ano} processado com sucesso`);
                    sucessos++;

                } catch (error) {
                    console.log(`✗ Erro no período ${regiao} ${period.mes.toString().padStart(2, '0')}/${period.ano}: ${error}`);
                    erros.push({
                        regiao,
                        mes: period.mes,
                        ano: period.ano
                    });
                } finally {
                    await this.cleanupTempFiles(tempFilePaths);
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

    // Método público para testar web scraping
    public async testWebScrapingSinglePeriod(mes: number, ano: number, regiao: string = 'BR'): Promise<void> {
        const browser = await chromium.launch({ headless: false });

        try {
            const page = await browser.newPage();

            // Fazer login
            await this.performLogin(page);

            console.log(`🌐 Testando web scraping para ICF ${regiao} ${mes.toString().padStart(2, '0')}/${ano}`);

            const data = await this.extractDataFromWebsite(page, mes, ano, regiao);
            await this.saveToDatabase(data);

            console.log(`✅ Web scraping bem-sucedido: ICF ${regiao} ${mes.toString().padStart(2, '0')}/${ano}`);
            console.log('📈 Dados salvos:', data);

        } catch (error) {
            console.log(`❌ Falha no web scraping: ICF ${regiao} ${mes.toString().padStart(2, '0')}/${ano} - ${error}`);
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
                    console.log(`🌐 Tentando web scraping para ICF ${error.regiao} ${error.mes.toString().padStart(2, '0')}/${error.ano}`);

                    const data = await this.extractDataFromWebsite(page, error.mes, error.ano, error.regiao);
                    await this.saveToDatabase(data);

                    console.log(`✅ Web scraping bem-sucedido: ICF ${error.regiao} ${error.mes.toString().padStart(2, '0')}/${error.ano}`);
                    sucessosWebScraping++;

                } catch (scrapingError) {
                    console.log(`❌ Falha no web scraping: ICF ${error.regiao} ${error.mes.toString().padStart(2, '0')}/${error.ano} - ${scrapingError}`);
                    errosWebScraping++;
                }
            }

            console.log(`\n=== Resultado do Web Scraping ICF ===`);
            console.log(`Sucessos: ${sucessosWebScraping}`);
            console.log(`Erros: ${errosWebScraping}`);
            console.log(`Total tentativas: ${errorList.length}`);

        } finally {
            await browser.close();
        }
    }

    private async performLogin(page: any): Promise<void> {
        console.log('🔐 Fazendo login no site ICF...');

        const baseUrl = process.env.BASE_URL_SITE_ICF || 'https://pesquisascnc.com.br/pesquisa-icf/';

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

    private async extractDataFromWebsite(page: any, mes: number, ano: number, regiao: string): Promise<Icf> {
        console.log(`📊 Extraindo dados do site ICF para ${regiao} ${mes}/${ano}`);

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

        // Extrair dados da tabela - ICF precisa de dados atuais e anteriores
        const currentTableData = await this.extractTableData(page, mes, ano);
        const previousPeriod = this.getPreviousPeriod(mes, ano);

        // Buscar dados do período anterior
        await this.navigateToNewPeriod(page, previousPeriod.mes, previousPeriod.ano, regiao);
        const previousTableData = await this.extractTableData(page, previousPeriod.mes, previousPeriod.ano);

        // Calcular percentuais
        const icfData = this.calculateWebScrapingPercentages(currentTableData, previousTableData);
        icfData.MES = mes;
        icfData.ANO = ano;
        icfData.REGIAO = regiao as Regiao;
        icfData.METODO = Metodo.WS;

        console.log('📈 Dados extraídos:', icfData);
        return icfData;
    }

    private async navigateToNewPeriod(page: any, mes: number, ano: number, regiao: string): Promise<void> {
        // Navegar para um novo período na mesma sessão
        await page.locator('#selectAno').selectOption(ano.toString());
        await page.locator('#selectMes').selectOption(mes.toString());
        await page.locator('#selectEstado').selectOption(regiao);
        await page.getByRole('button', { name: 'Filtrar' }).click();
        await page.waitForTimeout(3000);
    }

    private async extractTableData(page: any, mes: number, ano: number): Promise<IcfPontosData> {
        // Mapear mês para formato abreviado em inglês (JUL 25)
        const meses = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const mesAbrev = meses[mes - 1];
        const anoAbrev = ano.toString().slice(-2); // Pegar últimos 2 dígitos
        const periodoTarget = `${mesAbrev} ${anoAbrev}`;

        console.log(`🔍 Procurando período ICF: ${periodoTarget}`);

        try {
            // Usar abordagem similar aos outros serviços
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

                    // Validar se temos pelo menos 4 valores (período + 3 dados ICF)
                    if (values.length < 4) {
                        console.log('⚠️ Tentando separação alternativa por espaços múltiplos');
                        const altValues = rowData.split(/\s{2,}/).filter(val => val.trim() !== '');
                        console.log('📊 Valores alternativos:', altValues);

                        if (altValues.length >= 4) {
                            return this.processIcfTableValues(altValues.slice(1)); // Pular a primeira coluna (período)
                        } else {
                            throw new Error(`Dados insuficientes na tabela ICF. Esperado: 4 valores, Encontrado: ${altValues.length}`);
                        }
                    }

                    return this.processIcfTableValues(values.slice(1)); // Pular a primeira coluna (período)
                }
            }

            // Se não encontrou o período, mostrar períodos disponíveis
            console.log('🔍 Períodos disponíveis na tabela ICF:');
            data.forEach((rowData, index) => {
                if (rowData && rowData.trim()) {
                    const firstValue = rowData.split(/[\t\s]+/)[0];
                    if (firstValue && firstValue.match(/[A-Z]{3}\s?\d{2}/)) {
                        console.log(`   - "${firstValue.trim()}"`);
                    }
                }
            });

            throw new Error(`Período ${periodoTarget} não encontrado na tabela ICF`);

        } catch (error) {
            console.error('❌ Erro ao extrair dados da tabela ICF:', error);
            throw error;
        }
    }

    private processIcfTableValues(values: string[]): IcfPontosData {
        console.log('🔄 Processando valores ICF:', values);

        if (values.length < 3) {
            throw new Error(`Dados ICF insuficientes. Esperado: 3 valores, Encontrado: ${values.length}`);
        }

        // Parsear valores numéricos do ICF (formato brasileiro com vírgula)
        const parseIcfValue = (value: string): number => {
            const cleanValue = String(value).replace(',', '.');
            const num = parseFloat(cleanValue);
            return isNaN(num) ? 0 : num;
        };

        return {
            NC_PONTOS: parseIcfValue(values[0]),          // Total (NC)
            ATE_10_SM_PONTOS: parseIcfValue(values[1]),   // Até 10 SM
            MAIS_DE_10_SM_PONTOS: parseIcfValue(values[2]) // Mais de 10 SM
        };
    }

    private calculateWebScrapingPercentages(currentData: IcfPontosData, previousData: IcfPontosData): Icf {
        const calculatePercentage = (current: number, previous: number): number => {
            if (previous === 0) return 0;
            const percentage = ((current - previous) / previous) * 100;
            return Math.round(percentage * 10) / 10;
        };

        return {
            NC_PONTOS: currentData.NC_PONTOS,
            ATE_10_SM_PONTOS: currentData.ATE_10_SM_PONTOS,
            MAIS_DE_10_SM_PONTOS: currentData.MAIS_DE_10_SM_PONTOS,
            NC_PERCENTUAL: calculatePercentage(currentData.NC_PONTOS, previousData.NC_PONTOS),
            ATE_10_SM_PERCENTUAL: calculatePercentage(currentData.ATE_10_SM_PONTOS, previousData.ATE_10_SM_PONTOS),
            MAIS_DE_10_SM_PERCENTUAL: calculatePercentage(currentData.MAIS_DE_10_SM_PONTOS, previousData.MAIS_DE_10_SM_PONTOS),
            MES: 0,
            ANO: 0,
            REGIAO: Regiao.BR,
            METODO: Metodo.WS
        };
    }
}
