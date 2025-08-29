import axios from 'axios';
import * as XLSX from 'xlsx';
import * as fs from 'fs-extra';
import * as path from 'path';
import { chromium } from 'playwright';
import { icfRepository, metadadosIcfRepository } from '../database/repositories';
import { Icf, MetadadosIcf } from '../database/entities';
import { Regiao, Metodo, IErrorService, ITask, IServiceResult, IPeriod } from '../shared/interfaces';
import {
    generateServicePeriods,
    extractServicePeriodRange,
    calculateExecutionTime,
    calculateTaskStats,
    cleanupServiceTempFolder,
    LogMessages,
    roundToOneDecimal,
    transformJsonToICF
} from '../shared/utils';
import { In } from 'typeorm';

interface IcfCompleteData {
    NC_PONTOS: number;
    ATE_10_SM_PONTOS: number;
    MAIS_DE_10_SM_PONTOS: number;
    NC_PERCENTUAL: number;
    ATE_10_SM_PERCENTUAL: number;
    MAIS_DE_10_SM_PERCENTUAL: number;
}

export class IcfService {

    private readonly TEMP_DIR = path.join(__dirname, '../../../temp');
    private readonly TIMEOUT = 30000;
    private baseUrl = process.env.BASE_URL || 'https://backend.pesquisascnc.com.br/admin/4/upload';

    constructor() {
        this.ensureTempDirectory();
    }

    /**
     * Constrói o diretório temporário para armazenar arquivos
     */
    private async ensureTempDirectory(): Promise<void> {
        try {
            await fs.ensureDir(this.TEMP_DIR);
        } catch (error) {
            throw new Error(`Erro ao criar diretório temporário: ${error}`);
        }
    }

    /**
     * Salva múltiplos lotes de metadados no banco de dados de uma vez (versão otimizada)
     */
    private async saveBatchMetadataToDatabase(
        metadataToSaveList: Array<{ metadados: MetadadosIcf[]; icfId: string }>,
        registrosPlanilha: Icf[]
    ): Promise<void> {
        try {
            const allMetadataToSave: MetadadosIcf[] = [];

            // Preparar todos os metadados para salvar
            for (const item of metadataToSaveList) {
                // Buscar o registro ICF para vincular
                const icfEntity = registrosPlanilha.find((i) => i.id === item.icfId);

                if (!icfEntity) {
                    console.log(`⚠️ Registro ICF com ID ${item.icfId} não encontrado, pulando...`);
                    continue;
                }

                // Vincular cada metadado ao registro ICF
                for (const metadado of item.metadados) {
                    metadado.icf = icfEntity;
                    allMetadataToSave.push(metadado);
                }
            }

            // Salvar todos os metadados de uma vez usando saveMany (mais eficiente)
            if (allMetadataToSave.length > 0) {
                await metadadosIcfRepository.save(allMetadataToSave);
                console.log(`📊 Total de metadados salvos: ${allMetadataToSave.length}`);
            }

        } catch (error) {
            throw new Error(`Erro ao salvar lotes de metadados ICF no banco: ${error}`);
        }
    }

    /**
     * Converte valor do Excel para number
     */
    private parseExcelValueToNumber(value: any): number {
        if (value === null || value === undefined) return 0;
        if (typeof value === 'number') return roundToOneDecimal(value);

        // Se for string, limpar e converter
        const cleanValue = String(value).replace(',', '.');
        const num = parseFloat(cleanValue);
        return isNaN(num) ? 0 : roundToOneDecimal(num);
    }

    /**
     * Extrai os metadados completos da planilha ICF
     */
    private async extractMetadataFromExcel(filePath: string): Promise<MetadadosIcf[]> {
        try {
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null }) as any[][];

            // Usar a função otimizada para extrair dados estruturados
            const icfCompleta = transformJsonToICF(jsonData);

            // Converter para o formato MetadadosIcf
            const metadados: MetadadosIcf[] = [];

            for (const tipo of icfCompleta.icftableTipo) {
                for (const valor of tipo.valores) {
                    const metadado = new MetadadosIcf();
                    metadado.tipoIndice = tipo.tipo;
                    metadado.campo = valor.tipo;
                    metadado.TOTAL = this.parseExcelValueToNumber(valor.total);
                    metadado.ATE_10_SM = this.parseExcelValueToNumber(valor["até 10sm - %"]);
                    metadado.MAIS_DE_10_SM = this.parseExcelValueToNumber(valor["mais de 10sm - %"]);
                    metadado.indice = valor.indice;

                    metadados.push(metadado);
                }
            }

            return metadados;

        } catch (error) {
            throw new Error(`Erro ao extrair metadados da planilha ICF: ${error}`);
        }
    }

    /**
     * Localiza um arquivo de planilha já baixado na pasta temporária
     */
    private async findExistingExcelFile(regiao: string, mes: number, ano: number): Promise<string | null> {
        try {
            const files = await fs.readdir(this.TEMP_DIR);

            // Padrão do nome: icf_REGIAO_MESANO_timestamp.xls
            // Exemplo: icf_BR_62025_1735123456789.xls
            const pattern = `icf_${regiao}_${mes}${ano}_`;

            const matchingFile = files.find(file =>
                file.startsWith(pattern) && file.endsWith('.xls')
            );

            if (matchingFile) {
                const fullPath = path.join(this.TEMP_DIR, matchingFile);
                console.log(`📁 Arquivo encontrado: ${matchingFile}`);
                return fullPath;
            }

            console.log(`⚠️ Arquivo não encontrado para padrão: ${pattern}*.xls`);
            return null;
        } catch (error) {
            console.log(`❌ Erro ao buscar arquivo: ${error}`);
            return null;
        }
    }

    /**
     * Processa metadados para todos os registros ICF do tipo Planilha
     */
    private async processMetadataForPlanilhaRecords(idsIcf: string[]): Promise<void> {
        try {
            // 1. Filtrar todos os registros de ICF do método 'Planilha'
            const registrosPlanilha = await icfRepository.find({
                where: { id: In(idsIcf) },
                order: { ANO: 'ASC', MES: 'ASC' }
            });

            const registrosMetadados = await metadadosIcfRepository.find({
                relations: {
                    icf: true
                }
            })

            if (registrosPlanilha.length === 0) {
                console.log('ℹ️ Nenhum registro ICF do tipo Planilha encontrado');
                return;
            }

            console.log(`📊 Encontrados ${registrosPlanilha.length} registros ICF do tipo Planilha`);

            interface IPeriodRegion extends IPeriod {
                regiao: Regiao;
            }

            // 2. Mapear os registros para extrair períodos únicos por região
            const periodosMap = new Map<string, IPeriodRegion>();

            for (const registro of registrosPlanilha) {
                const chaveperiodo = `${registro.MES}-${registro.ANO}-${registro.REGIAO}`;
                if (!periodosMap.has(chaveperiodo)) {
                    periodosMap.set(chaveperiodo, {
                        mes: registro.MES,
                        ano: registro.ANO,
                        regiao: registro.REGIAO
                    });
                }
            }

            const periodos: IPeriodRegion[] = Array.from(periodosMap.values());
            console.log(`📅 Períodos únicos identificados: ${periodos.length}`);

            // Interface para acumular metadados que serão salvos
            interface MetadataToSave {
                metadados: MetadadosIcf[];
                icfId: string;
            }

            // 3. Para cada período/região, localizar a planilha já baixada e processar metadados
            const metadataToSaveList: MetadataToSave[] = [];

            for (const periodo of periodos) {

                try {
                    console.log(`📥 Processando metadados para período ${periodo.regiao} ${periodo.mes.toString().padStart(2, '0')}/${periodo.ano}...`);

                    // Localizar arquivo já baixado na pasta temporária
                    const filePath = await this.findExistingExcelFile(periodo.regiao, periodo.mes, periodo.ano);

                    if (!filePath) {
                        console.log(`⚠️ Arquivo não encontrado para ${periodo.regiao} ${periodo.mes}/${periodo.ano}, pulando processamento de metadados...`);
                        continue;
                    }

                    // Extrair metadados da planilha existente
                    const metadados = await this.extractMetadataFromExcel(filePath);

                    console.log(metadados)

                    if (metadados.length > 0) {
                        // Encontrar o registro ICF correspondente para a região e período específicos
                        const icfRecord = registrosPlanilha.find(r =>
                            r.MES === periodo.mes &&
                            r.ANO === periodo.ano &&
                            r.REGIAO === periodo.regiao
                        );

                        if (icfRecord && icfRecord.id) {

                            const metadadosExistentes = registrosMetadados.find(m =>
                                m.icf.id === icfRecord.id
                            );

                            if (!metadadosExistentes) {
                                // Acumular para salvar no final
                                metadataToSaveList.push({
                                    metadados,
                                    icfId: icfRecord.id
                                });

                                console.log(`✅ Metadados preparados para período ${periodo.regiao} ${periodo.mes.toString().padStart(2, '0')}/${periodo.ano} (${metadados.length} registros)`);
                            } else {
                                console.log(`ℹ️ Metadados já existem para período ${periodo.regiao} ${periodo.mes.toString().padStart(2, '0')}/${periodo.ano}`);
                            }
                        } else {
                            console.log(`⚠️ Registro ICF ${periodo.regiao} não encontrado para período ${periodo.mes.toString().padStart(2, '0')}/${periodo.ano}`);
                        }
                    } else {
                        console.log(`⚠️ Nenhum metadado extraído para período ${periodo.regiao} ${periodo.mes.toString().padStart(2, '0')}/${periodo.ano}`);
                    }

                } catch (error) {
                    console.log(`❌ Erro ao processar metadados para período ${periodo.regiao} ${periodo.mes.toString().padStart(2, '0')}/${periodo.ano}: ${error}`);
                }
            }

            // Salvar todos os metadados de uma vez
            if (metadataToSaveList.length > 0) {
                console.log(`\n💾 Salvando ${metadataToSaveList.length} lotes de metadados no banco de dados...`);
                await this.saveBatchMetadataToDatabase(metadataToSaveList, registrosPlanilha);
                console.log(`✅ Todos os metadados foram salvos com sucesso!`);
            } else {
                console.log(`ℹ️ Nenhum metadado novo para salvar`);
            }

            console.log('✅ Processamento de metadados ICF concluído');

        } catch (error) {
            console.error('❌ Erro no processamento de metadados ICF:', error);
            throw error;
        }
    }

    /**
     * Salva múltiplos registros ICF no banco de dados de uma vez (versão otimizada)
     */
    private async saveBatchIcfToDatabase(icfDataList: Icf[]): Promise<string[]> {
        try {
            if (icfDataList.length === 0) {
                return [];
            }

            const icfEntities: Icf[] = [];

            for (const data of icfDataList) {
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

                icfEntities.push(icfEntity);
            }

            // Salvar todos de uma vez usando save() com array
            const savedEntities = await icfRepository.save(icfEntities);

            console.log(`💾 Total de registros ICF salvos: ${savedEntities.length}`);

            return savedEntities.map(entity => entity.id!);
        } catch (error) {
            throw new Error(`Erro ao salvar lote de registros ICF no banco: ${error}`);
        }
    }

    /**
     * Processa os valores completos da tabela ICF.
     */
    private processCompleteIcfTableValues(values: string[]): IcfCompleteData {
        console.log('🔄 Processando valores completos ICF:', values);

        if (values.length < 6) {
            throw new Error(`Dados ICF completos insuficientes. Esperado: 6 valores (3 pontos + 3 percentuais), Encontrado: ${values.length}`);
        }

        // Parsear valores numéricos do ICF (formato brasileiro com vírgula)
        const parseIcfValue = (value: string): number => {
            const cleanValue = String(value).replace(',', '.');
            const num = parseFloat(cleanValue);
            return isNaN(num) ? 0 : num;
        };

        return {
            // Primeiros 3 valores são os pontos
            NC_PONTOS: parseIcfValue(values[0]),              // NC (pontos)
            ATE_10_SM_PONTOS: parseIcfValue(values[1]),       // Até 10 SM (pontos)
            MAIS_DE_10_SM_PONTOS: parseIcfValue(values[2]),   // Mais de 10 SM (pontos)
            // Próximos 3 valores são os percentuais
            NC_PERCENTUAL: parseIcfValue(values[3]),          // NC (percentual)
            ATE_10_SM_PERCENTUAL: parseIcfValue(values[4]),   // Até 10 SM (percentual)
            MAIS_DE_10_SM_PERCENTUAL: parseIcfValue(values[5]) // Mais de 10 SM (percentual)
        };
    }

    /**
     * Extrai os dados completos da tabela ICF para um determinado mês e ano.
     */
    private async extractCompleteTableData(page: any, mes: number, ano: number): Promise<IcfCompleteData> {
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

                    // Validar se temos pelo menos 7 valores (período + 6 dados ICF: 3 pontos + 3 percentuais)
                    if (values.length < 7) {
                        console.log('⚠️ Tentando separação alternativa por espaços múltiplos');
                        const altValues = rowData.split(/\s{2,}/).filter(val => val.trim() !== '');
                        console.log('📊 Valores alternativos:', altValues);

                        if (altValues.length >= 7) {
                            return this.processCompleteIcfTableValues(altValues.slice(1)); // Pular a primeira coluna (período)
                        } else {
                            throw new Error(`Dados insuficientes na tabela ICF. Esperado: 7 valores (período + 6 dados), Encontrado: ${altValues.length}`);
                        }
                    }

                    return this.processCompleteIcfTableValues(values.slice(1)); // Pular a primeira coluna (período)
                }
            }

            // Se não encontrou o período, mostrar períodos disponíveis
            console.log('🔍 Períodos disponíveis na tabela ICF:');
            data.forEach((rowData: string) => {
                if (rowData && rowData.trim()) {
                    const firstValue = rowData.split(/[\t\s]+/)[0];
                    if (firstValue && firstValue.match(/[A-Z]{3}\s?\d{2}/)) {
                        console.log(`   - "${firstValue.trim()}"`);
                    }
                }
            });

            throw new Error(`Período ${periodoTarget} não encontrado na tabela ICF`);

        } catch (error) {
            console.error('❌ Erro ao extrair dados completos da tabela ICF:', error);
            throw error;
        }
    }

    /**
     * Extrai dados completos do web scraping (pontos + percentuais)
     * Para web scraping: a tabela já contém tanto os pontos quanto os percentuais
     * Formato da tabela: MESES | NC | ATÉ 10 SM | + DE 10 SM | NC | ATÉ 10 SM | + DE 10 SM
     * Exemplo: FEB 10 | 135,8 | 134,1 | 146,1 | 0,2 | 0,5 | -1,8
     */
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

        // Para web scraping, extrair dados completos diretamente da tabela
        const completeData = await this.extractCompleteTableData(page, mes, ano);

        const icfData: Icf = {
            NC_PONTOS: completeData.NC_PONTOS,
            ATE_10_SM_PONTOS: completeData.ATE_10_SM_PONTOS,
            MAIS_DE_10_SM_PONTOS: completeData.MAIS_DE_10_SM_PONTOS,
            NC_PERCENTUAL: completeData.NC_PERCENTUAL,
            ATE_10_SM_PERCENTUAL: completeData.ATE_10_SM_PERCENTUAL,
            MAIS_DE_10_SM_PERCENTUAL: completeData.MAIS_DE_10_SM_PERCENTUAL,
            MES: mes,
            ANO: ano,
            REGIAO: regiao as Regiao,
            METODO: Metodo.WS
        };

        console.log('📈 Dados extraídos:', icfData);
        return icfData;
    }

    /**
     * Realiza o login no site ICF usando Playwright
     */
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

    /**
     * Versão com monitoramento do retry por web scraping para ICF
     */
    private async retryWithWebScrapingMonitoring(errorList: IErrorService[], tasks: ITask[]): Promise<number> {
        const browser = await chromium.launch({ headless: false });

        try {
            const page = await browser.newPage();

            // Fazer login
            await this.performLogin(page);

            let sucessosWebScraping = 0;
            const webScrapingDataList: Icf[] = [];

            for (const error of errorList) {
                try {
                    console.log(`🌐 Tentando web scraping para ICF ${error.regiao} ${error.mes.toString().padStart(2, '0')}/${error.ano}`);

                    const data = await this.extractDataFromWebsite(page, error.mes, error.ano, error.regiao);

                    // Acumular dados em vez de salvar imediatamente
                    webScrapingDataList.push(data);

                    console.log(`✅ Web scraping bem-sucedido: ICF ${error.regiao} ${error.mes.toString().padStart(2, '0')}/${error.ano}`);
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
                    console.log(`❌ Falha no web scraping: ICF ${error.regiao} ${error.mes.toString().padStart(2, '0')}/${error.ano} - ${scrapingError}`);

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

            // Salvar todos os dados de web scraping de uma vez
            if (webScrapingDataList.length > 0) {
                console.log(`\n💾 Salvando ${webScrapingDataList.length} registros de web scraping no banco de dados...`);
                await this.saveBatchIcfToDatabase(webScrapingDataList);
                console.log(`✅ Todos os registros de web scraping foram salvos com sucesso!`);
            }

            console.log(`\n=== Resultado do Web Scraping ICF ===`);
            console.log(`Sucessos: ${sucessosWebScraping}`);
            console.log(`Erros: ${errorList.length - sucessosWebScraping}`);
            console.log(`Total tentativas: ${errorList.length}`);

            return sucessosWebScraping;

        } finally {
            await browser.close();
        }
    }

    /**
    * Extrai os dados completos ICF de uma planilha Excel (pontos + percentuais)
    * Estrutura da nova planilha: já contém os percentuais calculados na linha "Índice (Variação Mensal)"
    */
    private async extractCompleteDataFromExcel(filePath: string): Promise<IcfCompleteData> {
        try {
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null }) as any[][];

            let pontosRow: any[] | null = null;
            let percentuaisRow: any[] | null = null;

            // Buscar as duas linhas necessárias
            for (let i = 0; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (row && Array.isArray(row) && row.length >= 4) {
                    const firstCell = String(row[0] || '').toLowerCase().trim();

                    // Linha com os pontos
                    if (firstCell.includes('índice (em pontos)')) {
                        pontosRow = row;
                    }

                    // Linha com os percentuais (variação mensal)
                    if (firstCell.includes('índice (variação mensal)')) {
                        percentuaisRow = row;
                    }
                }
            }

            if (!pontosRow) {
                throw new Error('Linha "Índice (Em Pontos)" não encontrada na planilha ICF');
            }

            if (!percentuaisRow) {
                throw new Error('Linha "Índice (Variação Mensal)" não encontrada na planilha ICF');
            }

            // Extrair os pontos (colunas 1, 2, 3)
            const pontosData = pontosRow.slice(1, 4).map(val => {
                const num = parseFloat(String(val || '0').replace(',', '.'));
                return isNaN(num) ? 0 : roundToOneDecimal(num);
            });

            // Extrair os percentuais (colunas 1, 2, 3)
            const percentuaisData = percentuaisRow.slice(1, 4).map(val => {
                const num = parseFloat(String(val || '0').replace(',', '.'));
                return isNaN(num) ? 0 : roundToOneDecimal(num);
            });

            return {
                NC_PONTOS: pontosData[0],
                ATE_10_SM_PONTOS: pontosData[1],
                MAIS_DE_10_SM_PONTOS: pontosData[2],
                NC_PERCENTUAL: percentuaisData[0],
                ATE_10_SM_PERCENTUAL: percentuaisData[1],
                MAIS_DE_10_SM_PERCENTUAL: percentuaisData[2]
            };
        } catch (error) {
            throw new Error(`Erro ao processar arquivo Excel ICF: ${error}`);
        }
    }

    /** Realiza o download do arquivo Excel ICF */
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

    /** Constrói a URL para o arquivo Excel ICF */
    private buildUrl(mes: number, ano: number, regiao: string = 'BR'): string {
        return `${this.baseUrl}/${mes}_${ano}/ICF/${regiao}.xls`;
    }

    /** Limpa a base de dados ICF */
    private async cleanDatabase(): Promise<string> {
        try {
            const logMessages: string[] = [];

            // Limpar metadados primeiro (respeitando foreign key constraint)
            console.log('🧹 Limpando metadados ICF...');
            await metadadosIcfRepository.createQueryBuilder()
                .delete()
                .from(MetadadosIcf)
                .execute();
            logMessages.push('✅ Metadados ICF limpos com sucesso');

            // Limpar registros ICF
            console.log('🧹 Limpando registros ICF...');
            await icfRepository.createQueryBuilder()
                .delete()
                .from(Icf)
                .execute();
            logMessages.push('✅ Registros ICF limpos com sucesso');

            return logMessages.join('\n') + '\n';

        } catch (error) {
            return `Erro ao limpar a base de dados ICF: ${error}\n`;
        }
    }

    /**
     * Versão com monitoramento do processamento ICF
     */
    public async processAllIcfDataWithMonitoring(regioes: string[] = ['BR']): Promise<IServiceResult> {
        const startTime = Date.now();
        console.log('🚀 Iniciando processamento completo dos dados ICF com monitoramento...\n');

        const resultadoLimpeza = await this.cleanDatabase();
        console.log(resultadoLimpeza);

        console.log(`📍 Regiões a processar: ${regioes.join(', ')}\n`);

        const periods = generateServicePeriods('ICF');
        const tasks: ITask[] = [];
        let registrosPlanilha = 0;
        let registrosWebScraping = 0;
        let erros: IErrorService[] = [];

        // Array para acumular todos os dados ICF antes de salvar
        const icfDataList: Icf[] = [];

        for (const period of periods) {
            for (const regiao of regioes) {

                try {
                    console.log(LogMessages.processando('ICF', regiao, period.mes, period.ano));

                    const currentUrl = this.buildUrl(period.mes, period.ano, regiao);
                    const currentFilePath = await this.downloadExcelFile(currentUrl, `${regiao}_${period.mes}${period.ano}_${Date.now()}`);

                    // Extrair dados completos diretamente da planilha (pontos + percentuais)
                    const completeData = await this.extractCompleteDataFromExcel(currentFilePath);

                    const icfData: Icf = {
                        NC_PONTOS: completeData.NC_PONTOS,
                        ATE_10_SM_PONTOS: completeData.ATE_10_SM_PONTOS,
                        MAIS_DE_10_SM_PONTOS: completeData.MAIS_DE_10_SM_PONTOS,
                        NC_PERCENTUAL: completeData.NC_PERCENTUAL,
                        ATE_10_SM_PERCENTUAL: completeData.ATE_10_SM_PERCENTUAL,
                        MAIS_DE_10_SM_PERCENTUAL: completeData.MAIS_DE_10_SM_PERCENTUAL,
                        MES: period.mes,
                        ANO: period.ano,
                        REGIAO: regiao as Regiao,
                        METODO: Metodo.PLA
                    };

                    // Acumular dados em vez de salvar imediatamente
                    icfDataList.push(icfData);

                    console.log(`✅ Período ${regiao} ${period.mes.toString().padStart(2, '0')}/${period.ano} processado com sucesso`);

                    tasks.push({
                        mes: period.mes,
                        ano: period.ano,
                        regiao,
                        status: 'Sucesso',
                        servico: 'ICF',
                        metodo: Metodo.PLA
                    });

                    registrosPlanilha++;

                } catch (error) {
                    console.log(`✗ Erro no período ${regiao} ${period.mes.toString().padStart(2, '0')}/${period.ano}: ${error}`);

                    tasks.push({
                        mes: period.mes,
                        ano: period.ano,
                        regiao: regiao,
                        status: 'Falha',
                        servico: 'ICF',
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

        let idsSalvos: string[] = [];

        // Salvar todos os registros ICF de uma vez
        if (icfDataList.length > 0) {
            console.log(`\n💾 Salvando ${icfDataList.length} registros ICF no banco de dados...`);
            idsSalvos = await this.saveBatchIcfToDatabase(icfDataList);
            console.log(`✅ Todos os registros ICF foram salvos com sucesso!`);
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
            servico: 'ICF',
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

        console.log(`\n=== Processamento ICF concluído ===`);
        console.log(`Sucessos: ${sucessos}`);
        console.log(`Falhas: ${falhas}`);
        console.log(`Tempo: ${Math.round(tempoExecucao / 60)} minutos`);
        console.log(`Registros por planilha: ${registrosPlanilha}`);
        console.log(`Registros por web scraping: ${registrosWebScraping}`);

        // Nova etapa: processar metadados para registros do tipo Planilha
        if (idsSalvos.length) {
            console.log('\n🔄 Iniciando processamento de metadados ICF...');
            await this.processMetadataForPlanilhaRecords(idsSalvos);
        }

        // Limpeza da pasta temp ao final da execução
        await cleanupServiceTempFolder('icf', this.TEMP_DIR);

        return resultado;
    }
}
