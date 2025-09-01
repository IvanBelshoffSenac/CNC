import axios from 'axios';
import * as XLSX from 'xlsx';
import * as fs from 'fs-extra';
import * as path from 'path';
import { chromium } from 'playwright';
import { icecRepository, metadadosIcecRepository } from '../database/repositories';
import { Icec, MetadadosIcec } from '../database/entities';
import { Regiao, Metodo, IErrorService, ITask, IServiceResult, IPeriod } from '../shared/interfaces';
import {
    generateServicePeriods,
    extractServicePeriodRange,
    calculateExecutionTime,
    calculateTaskStats,
    cleanupServiceTempFolder,
    LogMessages,
    transformJsonToICEC,
} from '../shared/utils';
import { In } from 'typeorm';

export class IcecService {

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

    // ========================================
    // SEÇÃO 1: MÉTODOS DE METADADOS
    // ========================================

    /**
     * Salva múltiplos lotes de metadados no banco de dados de uma vez (versão otimizada)
     */
    private async saveBatchMetadataToDatabase(
        metadataToSaveList: Array<{ metadados: MetadadosIcec[]; icecId: string }>,
        registrosPlanilha: Icec[]
    ): Promise<void> {
        try {
            const allMetadataToSave: MetadadosIcec[] = [];

            // Preparar todos os metadados para salvar
            for (const item of metadataToSaveList) {
                // Buscar o registro ICEC para vincular
                const icecEntity = registrosPlanilha.find((i) => i.id === item.icecId);

                if (!icecEntity) {
                    console.log(`⚠️ Registro ICEC com ID ${item.icecId} não encontrado, pulando...`);
                    continue;
                }

                // Vincular cada metadado ao registro ICEC
                for (const metadado of item.metadados) {
                    metadado.icec = icecEntity;
                    allMetadataToSave.push(metadado);
                }
            }

            // Salvar todos os metadados de uma vez usando saveMany (mais eficiente)
            if (allMetadataToSave.length > 0) {
                await metadadosIcecRepository.save(allMetadataToSave);
                console.log(`📊 Total de metadados salvos: ${allMetadataToSave.length}`);
            }

        } catch (error) {
            throw new Error(`Erro ao salvar lotes de metadados ICEC no banco: ${error}`);
        }
    }

    /**
     * Converte valor do Excel para string preservando o valor original
     */
    private parseValueToString(value: any): string {
        if (value === null || value === undefined) return '';
        return String(value);
    }

    /**
     * Extrai os metadados completos da planilha ICEC
     */
    private async extractMetadataFromExcel(filePath: string): Promise<MetadadosIcec[]> {
        try {
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null }) as any[][];
            
            // Usar a função otimizada para extrair dados estruturados
            const icecCompleta = transformJsonToICEC(jsonData);

            // Converter para o formato MetadadosIcec
            const metadados: MetadadosIcec[] = [];

            for (const tipo of icecCompleta.icectableTipo) {
                for (const valor of tipo.valores) {
                    const metadado = new MetadadosIcec();
                    metadado.TIPOINDICE = tipo.tipo;
                    metadado.CAMPO = valor.tipo;
                    
                    // Salvar dados brutos como string
                    metadado.TOTAL = this.parseValueToString(valor.total);
                    metadado.EMPRESAS_COM_ATÉ_50_EMPREGADOS = this.parseValueToString(valor["Empresas com até 50 empregados"]);
                    metadado.EMPRESAS_COM_MAIS_DE_50_EMPREGADOS = this.parseValueToString(valor["Empresas com mais de 50 empregados"]);
                    metadado.SEMIDURAVEIS = this.parseValueToString(valor.semiduraveis);
                    metadado.NAO_DURAVEIS = this.parseValueToString(valor.nao_duraveis);
                    metadado.DURAVEIS = this.parseValueToString(valor.duraveis);
                    metadado.INDICE = valor.indice;
                    metadado.TIPOPESQUISA = valor.tipopesquisa;

                    metadados.push(metadado);
                }
            }

            return metadados;

        } catch (error) {
            throw new Error(`Erro ao extrair metadados da planilha ICEC: ${error}`);
        }
    }

    /**
     * Localiza um arquivo de planilha já baixado na pasta temporária
     */
    private async findExistingExcelFile(regiao: string, mes: number, ano: number): Promise<string | null> {
        try {
            const files = await fs.readdir(this.TEMP_DIR);

            // Padrão do nome: icec_REGIAO_MESANO_timestamp.xls
            // Exemplo: icec_BR_62025_1735123456789.xls
            const pattern = `icec_${regiao}_${mes}${ano}_`;

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
     * Processa metadados para todos os registros ICEC do tipo Planilha
     */
    private async processMetadataForPlanilhaRecords(idsIcec: string[]): Promise<void> {
        try {
            // 1. Filtrar todos os registros de ICEC do método 'Planilha'
            const registrosPlanilha = await icecRepository.find({
                where: { id: In(idsIcec) },
                order: { ANO: 'ASC', MES: 'ASC' }
            });

            const registrosMetadados = await metadadosIcecRepository.find({
                relations: {
                    icec: true
                }
            })

            if (registrosPlanilha.length === 0) {
                console.log('ℹ️ Nenhum registro ICEC do tipo Planilha encontrado');
                return;
            }

            console.log(`📊 Encontrados ${registrosPlanilha.length} registros ICEC do tipo Planilha`);

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
                metadados: MetadadosIcec[];
                icecId: string;
            }

            // 3. Para cada período/região, localizar a planilha já baixada e processar metadados
            const metadataToSaveList: MetadataToSave[] = [];

            for (const periodo of periodos) {

                try {
                    console.log(`📥 Processando metadados para período ${periodo.regiao} ${periodo.mes.toString().padStart(2, '0')}/${periodo.ano}...`);

                    // Localizar arquivo já baixado na pasta temporária
                    const filePath = await this.findExistingExcelFile(periodo.regiao, periodo.mes, periodo.ano);

                    if (!filePath) {
                        console.log(`⚠️ Arquivo não encontrado para período ${periodo.regiao} ${periodo.mes.toString().padStart(2, '0')}/${periodo.ano}, pulando metadados...`);
                        continue;
                    }

                    // Extrair metadados da planilha existente
                    const metadados = await this.extractMetadataFromExcel(filePath);

                    if (metadados.length > 0) {
                        // Encontrar registros ICEC que correspondem a este período/região
                        const registrosDoperiodo = registrosPlanilha.filter(
                            (r) => r.MES === periodo.mes && r.ANO === periodo.ano && r.REGIAO === periodo.regiao
                        );

                        for (const registro of registrosDoperiodo) {
                            // Verificar se já existem metadados para este registro
                            const metadadosExistentes = registrosMetadados.filter(
                                (m) => m.icec && m.icec.id === registro.id
                            );

                            if (metadadosExistentes.length === 0) {
                                metadataToSaveList.push({
                                    metadados: [...metadados], // Fazer cópia dos metadados
                                    icecId: registro.id!
                                });
                                console.log(`✅ Metadados preparados para ICEC ID: ${registro.id} (${periodo.regiao} ${periodo.mes.toString().padStart(2, '0')}/${periodo.ano})`);
                            } else {
                                console.log(`ℹ️ Metadados já existem para ICEC ID: ${registro.id} (${periodo.regiao} ${periodo.mes.toString().padStart(2, '0')}/${periodo.ano})`);
                            }
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

            console.log('✅ Processamento de metadados ICEC concluído');

        } catch (error) {
            console.error('❌ Erro no processamento de metadados ICEC:', error);
            throw error;
        }
    }

    // ========================================
    // SEÇÃO 2: MÉTODOS DE BANCO DE DADOS
    // ========================================

    /**
     * Salva múltiplos registros ICEC no banco de dados de uma vez (versão otimizada)
     */
    private async saveBatchIcecToDatabase(icecDataList: Icec[]): Promise<string[]> {
        try {
            if (icecDataList.length === 0) {
                return [];
            }

            const icecEntities: Icec[] = [];

            for (const data of icecDataList) {
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

                icecEntities.push(icecEntity);
            }

            // Salvar todos de uma vez usando save() com array
            const savedEntities = await icecRepository.save(icecEntities);

            console.log(`💾 Total de registros ICEC salvos: ${savedEntities.length}`);

            return savedEntities.map(entity => entity.id!);
        } catch (error) {
            throw new Error(`Erro ao salvar lote de registros ICEC no banco: ${error}`);
        }
    }

    /**
     * Limpa a base de dados ICEC
     */
    private async cleanDatabase(): Promise<string> {
        try {
            const logMessages: string[] = [];

            // Limpar metadados primeiro (respeitando foreign key constraint)
            console.log('🧹 Limpando metadados ICEC...');
            await metadadosIcecRepository.createQueryBuilder()
                .delete()
                .from(MetadadosIcec)
                .execute();
            logMessages.push('✅ Metadados ICEC limpos com sucesso');

            // Limpar registros ICEC
            console.log('🧹 Limpando registros ICEC...');
            await icecRepository.createQueryBuilder()
                .delete()
                .from(Icec)
                .execute();
            logMessages.push('✅ Registros ICEC limpos com sucesso');

            return logMessages.join('\n') + '\n';

        } catch (error) {
            return `Erro ao limpar a base de dados ICEC: ${error}\n`;
        }
    }

    // ========================================
    // SEÇÃO 3: MÉTODOS DE PROCESSAMENTO DE DADOS
    // ========================================

    /**
     * Extrai os dados completos ICEC de uma planilha Excel
     */
    private async extractCompleteDataFromExcel(filePath: string): Promise<Icec> {
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

            // Extrair valores como string preservando o valor original (colunas 1-6: Total, Até 50, Mais de 50, Semiduráveis, Não duráveis, Duráveis)
            const stringData = icecRow.slice(1, 7).map(val => String(val || ''));

            return {
                ICEC: stringData[0],
                ATÉ_50: stringData[1],
                MAIS_DE_50: stringData[2],
                SEMIDURAVEIS: stringData[3],
                NAO_DURAVEIS: stringData[4],
                DURAVEIS: stringData[5],
                MES: 0, // Será definido posteriormente
                ANO: 0, // Será definido posteriormente
                REGIAO: 'BR' as any, // Será definido posteriormente
                METODO: Metodo.PLA
            };
        } catch (error) {
            throw new Error(`Erro ao processar arquivo ICEC: ${error}`);
        }
    }

    // ========================================
    // SEÇÃO 4: MÉTODOS DE ARQUIVOS
    // ========================================

    /**
     * Realiza o download do arquivo Excel ICEC
     */
    private async downloadExcelFile(url: string, identifier: string): Promise<string> {
        const fileName = `icec_${identifier}_${Date.now()}.xls`;
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
            throw new Error(`Erro ao baixar arquivo ICEC (${identifier}): ${error}`);
        }
    }

    /**
     * Constrói a URL para o arquivo Excel ICEC
     */
    private buildUrl(mes: number, ano: number, regiao: string = 'BR'): string {
        return `${this.baseUrl}/${mes}_${ano}/ICEC/${regiao}.xls`;
    }

    // ========================================
    // SEÇÃO 5: MÉTODOS DE WEB SCRAPING
    // ========================================

    /**
     * Processa valores da tabela ICEC mantendo como string
     */
    private processIcecTableValues(values: string[]): any {
        console.log('🔄 Processando valores ICEC:', values);

        if (values.length < 6) {
            throw new Error(`Dados ICEC insuficientes. Esperado: 6 valores, Encontrado: ${values.length}`);
        }

        return {
            ICEC: String(values[0] || ''),           // Mantendo como string
            ATÉ_50: String(values[1] || ''),         // Mantendo como string
            MAIS_DE_50: String(values[2] || ''),     // Mantendo como string
            SEMIDURAVEIS: String(values[3] || ''),   // Mantendo como string
            NAO_DURAVEIS: String(values[4] || ''),   // Mantendo como string
            DURAVEIS: String(values[5] || '')        // Mantendo como string
        };
    }

    /**
     * Realiza login no site ICEC
     */
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

    /**
     * Extrai dados do site ICEC via web scraping
     */
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

    /**
     * Extrai dados da tabela do site ICEC
     */
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

    /**
     * Versão com monitoramento do retry por web scraping para ICEC
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
                    const savedIds = await this.saveBatchIcecToDatabase([data]);

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

    // ========================================
    // SEÇÃO 6: MÉTODO PRINCIPAL PÚBLICO
    // ========================================

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

        // Array para acumular todos os dados ICEC antes de salvar
        const icecDataList: Icec[] = [];

        for (const period of periods) {
            for (const regiao of regioes) {
                try {
                    console.log(LogMessages.processando('ICEC', regiao, period.mes, period.ano));

                    const currentUrl = this.buildUrl(period.mes, period.ano, regiao);
                    const currentFilePath = await this.downloadExcelFile(currentUrl, `${regiao}_${period.mes}${period.ano}`);

                    // Extrair dados completos diretamente da planilha
                    const completeData = await this.extractCompleteDataFromExcel(currentFilePath);

                    const icecData: Icec = {
                        ...completeData,
                        MES: period.mes,
                        ANO: period.ano,
                        REGIAO: regiao as Regiao
                    };

                    icecDataList.push(icecData);

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

        let idsSalvos: string[] = [];

        // Salvar todos os registros ICEC de uma vez
        if (icecDataList.length > 0) {
            console.log(`\n💾 Salvando ${icecDataList.length} registros ICEC no banco de dados...`);
            idsSalvos = await this.saveBatchIcecToDatabase(icecDataList);
            console.log(`✅ Todos os registros ICEC foram salvos com sucesso!`);
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

        // Nova etapa: processar metadados para registros do tipo Planilha
        if (idsSalvos.length) {
            console.log('\n🔄 Iniciando processamento de metadados ICEC...');
            await this.processMetadataForPlanilhaRecords(idsSalvos);
        }

        // Limpeza da pasta temp ao final da execução
        await cleanupServiceTempFolder('icec', this.TEMP_DIR);

        return resultado;
    }
}

