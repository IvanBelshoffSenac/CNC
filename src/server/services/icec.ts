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

    // ========================================
    // PROPRIEDADES E CONFIGURAÇÕES
    // ========================================

    private readonly TEMP_DIR = path.join(__dirname, '../../../temp');
    private readonly TIMEOUT = 30000;
    private baseUrl = process.env.BASE_URL || 'https://backend.pesquisascnc.com.br/admin/4/upload';

    // ========================================
    // CONSTRUTOR E INICIALIZAÇÃO
    // ========================================

    constructor() {
        this.ensureTempDirectory();
    }

    /**
     * Inicializa e garante que o diretório temporário existe para armazenar arquivos
     */
    private async ensureTempDirectory(): Promise<void> {
        try {
            await fs.ensureDir(this.TEMP_DIR);
        } catch (error) {
            throw new Error(`Erro ao criar diretório temporário: ${error}`);
        }
    }

    // ========================================
    // SEÇÃO 1: MÉTODOS UTILITÁRIOS E HELPERS
    // ========================================

    /**
     * Converte qualquer valor para string preservando o valor original
     * Trata valores nulos e indefinidos retornando string vazia
     */
    private parseValueToString(value: any): string {
        if (value === null || value === undefined) return '';
        return String(value);
    }

    /**
     * Constrói a URL completa para download do arquivo Excel ICEC
     * @param mes Mês do período desejado (1-12)
     * @param ano Ano do período desejado
     * @param regiao Região do arquivo (padrão: 'BR')
     * @returns URL completa do arquivo
     */
    private buildUrl(mes: number, ano: number, regiao: string = 'BR'): string {
        return `${this.baseUrl}/${mes}_${ano}/ICEC/${regiao}.xls`;
    }

    // ========================================
    // SEÇÃO 2: MÉTODOS DE ARQUIVOS E DOWNLOAD
    // ========================================

    /**
     * Localiza um arquivo de planilha Excel já baixado na pasta temporária
     * @param regiao Região do arquivo (ex: 'BR', 'SP')
     * @param mes Mês do período (1-12)
     * @param ano Ano do período
     * @returns Caminho completo do arquivo se encontrado, null caso contrário
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
     * Realiza o download de um arquivo Excel ICEC do servidor remoto
     * @param url URL completa do arquivo a ser baixado
     * @param identifier Identificador único para nomenclatura do arquivo
     * @returns Caminho completo do arquivo baixado
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

    // ========================================
    // SEÇÃO 3: MÉTODOS DE METADADOS
    // ========================================

    /**
     * Extrai metadados completos de uma planilha ICEC utilizando função otimizada
     * Processa todos os tipos de índices e seus respectivos valores
     * @param filePath Caminho completo da planilha Excel
     * @returns Array de objetos MetadadosIcec com todos os dados estruturados
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
     * Processa extração de metadados para todos os registros ICEC obtidos via planilha
     * Localiza arquivos já baixados e extrai metadados detalhados
     * @param idsIcec Array com IDs dos registros ICEC para processamento de metadados
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
            });

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

            // 3. Para cada período/região, localizar a planilha já baixada e processar metadados
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
                                // Salvar metadados individualmente
                                await this.saveIndividualMetadataToDatabase([...metadados], registro);
                                console.log(`✅ Metadados salvos para ICEC ID: ${registro.id} (${periodo.regiao} ${periodo.mes.toString().padStart(2, '0')}/${periodo.ano})`);
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

            console.log('✅ Processamento de metadados ICEC concluído');

        } catch (error) {
            console.error('❌ Erro no processamento de metadados ICEC:', error);
            throw error;
        }
    }

    // ========================================
    // SEÇÃO 4: MÉTODOS DE BANCO DE DADOS
    // ========================================

    /**
     * Salva um único registro ICEC no banco de dados
     * Utilizado para evitar problemas de performance em produção com grandes volumes
     * @param icecData Objeto Icec para ser salvo
     * @returns ID do registro salvo
     */
    private async saveIndividualIcecToDatabase(icecData: Icec): Promise<string> {
        try {
            const icecEntity = new Icec();
            icecEntity.ICEC = icecData.ICEC;
            icecEntity.ATÉ_50 = icecData.ATÉ_50;
            icecEntity.MAIS_DE_50 = icecData.MAIS_DE_50;
            icecEntity.SEMIDURAVEIS = icecData.SEMIDURAVEIS;
            icecEntity.NAO_DURAVEIS = icecData.NAO_DURAVEIS;
            icecEntity.DURAVEIS = icecData.DURAVEIS;
            icecEntity.MES = icecData.MES;
            icecEntity.ANO = icecData.ANO;
            icecEntity.REGIAO = icecData.REGIAO;
            icecEntity.METODO = icecData.METODO;

            const savedEntity = await icecRepository.save(icecEntity);
            console.log(`💾 Registro ICEC salvo: ${icecData.REGIAO} ${icecData.MES.toString().padStart(2, '0')}/${icecData.ANO}`);

            return savedEntity.id!;
        } catch (error) {
            throw new Error(`Erro ao salvar registro ICEC individual no banco: ${error}`);
        }
    }

    /**
     * Salva metadados individuais no banco de dados
     * Vincula cada metadado ao seu respectivo registro ICEC
     * @param metadados Array de metadados para salvar
     * @param icecEntity Registro ICEC para vinculação
     */
    private async saveIndividualMetadataToDatabase(
        metadados: MetadadosIcec[],
        icecEntity: Icec
    ): Promise<void> {
        try {
            if (metadados.length === 0) {
                return;
            }

            // Vincular cada metadado ao registro ICEC
            const metadatosToSave: MetadadosIcec[] = [];
            for (const metadado of metadados) {
                metadado.icec = icecEntity;
                metadatosToSave.push(metadado);
            }

            // Salvar metadados
            await metadadosIcecRepository.save(metadatosToSave);
            console.log(`📊 ${metadatosToSave.length} metadados salvos para ICEC ID: ${icecEntity.id}`);

        } catch (error) {
            throw new Error(`Erro ao salvar metadados individuais no banco: ${error}`);
        }
    }

    /**
     * Remove todos os dados ICEC e metadados do banco de dados
     * Respeita a ordem de exclusão para manter integridade referencial
     * @returns String com log das operações realizadas
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
    // SEÇÃO 5: MÉTODOS DE PROCESSAMENTO DE DADOS
    // ========================================

    /**
     * Extrai os dados completos ICEC de uma planilha Excel
     * Busca especificamente pela linha que contém 'Índice (em Pontos)' que representa os dados finais do ICEC
     * @param filePath Caminho completo do arquivo Excel a ser processado
     * @returns Objeto Icec com todos os dados extraídos (valores como string)
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
    // SEÇÃO 6: MÉTODOS DE WEB SCRAPING
    // ========================================

    /**
     * Processa e valida valores extraídos da tabela ICEC mantendo formato string
     * @param values Array de strings com os valores da tabela
     * @returns Objeto com os dados ICEC formatados
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
     * Realiza autenticação no site ICEC utilizando credenciais do ambiente
     * @param page Instância da página do Playwright
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
     * Extrai dados ICEC do site via web scraping para um período específico
     * @param page Instância da página do Playwright
     * @param mes Mês do período desejado (1-12)
     * @param ano Ano do período desejado
     * @param regiao Região dos dados (ex: 'BR', 'SP')
     * @returns Objeto Icec com dados extraídos via web scraping
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
        const tableData = await this.extractCompleteTableData(page, mes, ano);

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
     * Extrai e processa dados específicos da tabela ICEC no site
     * @param page Instância da página do Playwright
     * @param mes Mês do período para localização na tabela
     * @param ano Ano do período para localização na tabela
     * @returns Dados processados da tabela ICEC
     */
    private async extractCompleteTableData(page: any, mes: number, ano: number): Promise<any> {
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
                        throw new Error(`Dados insuficientes na linha. Esperado: 7+ valores, Encontrado: ${values.length}`);
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
                        console.log(`  ${index}: ${firstValue}`);
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
     * Executa tentativas de recuperação via web scraping para períodos que falharam
     * Implementa monitoramento detalhado de cada tentativa
     * @param errorList Lista de erros/períodos para retry
     * @param tasks Array de tasks para atualização de status
     * @returns Número de sucessos obtidos via web scraping
     */
    private async retryWithWebScrapingMonitoring(errorList: IErrorService[], tasks: ITask[]): Promise<number> {
        const browser = await chromium.launch({ headless: true });

        try {
            const page = await browser.newPage();

            // Fazer login
            await this.performLogin(page);

            let sucessosWebScraping = 0;

            for (const error of errorList) {
                try {
                    console.log(LogMessages.webScrapingInicio('ICEC', error.regiao, error.mes, error.ano));

                    const data = await this.extractDataFromWebsite(page, error.mes, error.ano, error.regiao);
                    const savedId = await this.saveIndividualIcecToDatabase(data);

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
    // SEÇÃO 7: MÉTODO PRINCIPAL PÚBLICO
    // ========================================

    /**
     * Método principal que executa o processamento completo dos dados ICEC
     * Inclui download, extração, salvamento individual, retry via web scraping e processamento de metadados
     * @param regioes Array de regiões para processamento (padrão: ['BR'])
     * @returns Objeto IServiceResult com estatísticas completas da execução
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
        let savedIds: string[] = [];

        for (const period of periods) {
            for (const regiao of regioes) {
                try {
                    console.log(LogMessages.processando('ICEC', regiao, period.mes, period.ano));

                    const currentUrl = this.buildUrl(period.mes, period.ano, regiao);
                    const currentFilePath = await this.downloadExcelFile(currentUrl, `${regiao}_${period.mes}${period.ano}`);

                    // Extrair dados completos diretamente da planilha
                    const completeData = await this.extractCompleteDataFromExcel(currentFilePath);
                    completeData.MES = period.mes;
                    completeData.ANO = period.ano;
                    completeData.REGIAO = regiao as Regiao;
                    completeData.METODO = Metodo.PLA;

                    // Salvar registro individual no banco de dados
                    const savedId = await this.saveIndividualIcecToDatabase(completeData);
                    savedIds.push(savedId);
                    registrosPlanilha++;

                    tasks.push({
                        mes: period.mes,
                        ano: period.ano,
                        regiao,
                        status: 'Sucesso',
                        servico: 'ICEC',
                        metodo: Metodo.PLA
                    });

                    console.log(LogMessages.sucesso('ICEC', regiao, period.mes, period.ano));

                } catch (error) {

                    console.log(LogMessages.erro('ICEC', regiao, period.mes, period.ano, error));

                    erros.push({
                        regiao,
                        mes: period.mes,
                        ano: period.ano
                    });

                    tasks.push({
                        mes: period.mes,
                        ano: period.ano,
                        regiao,
                        status: 'Falha',
                        servico: 'ICEC',
                        metodo: Metodo.PLA,
                        erro: String(error)
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

        // Processar metadados para registros do tipo Planilha
        if (savedIds.length) {
            console.log('\n🔄 Iniciando processamento de metadados ICEC...');
            await this.processMetadataForPlanilhaRecords(savedIds);
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
}