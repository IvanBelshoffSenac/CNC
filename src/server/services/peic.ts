import axios from 'axios';
import * as XLSX from 'xlsx';
import * as fs from 'fs-extra';
import * as path from 'path';
import { chromium } from 'playwright';
import { metadadosPeicRepository, peicRepository } from '../database/repositories';
import { MetadadosPeic, Peic } from '../database/entities';
import { Regiao, Metodo, IErrorService, ITask, IServiceResult, IPeriod } from '../shared/interfaces';
import {
    generateServicePeriods,
    extractServicePeriodRange,
    calculateExecutionTime,
    calculateTaskStats,
    cleanupServiceTempFolder,
    LogMessages,
    transformJsonToPEIC
} from '../shared/utils';
import { In } from 'typeorm';

export class PeicService {

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
     * Constrói a URL completa para download do arquivo Excel PEIC
     * @param mes Mês do período desejado (1-12)
     * @param ano Ano do período desejado
     * @param regiao Região do arquivo (padrão: 'BR')
     * @returns URL completa do arquivo
     */
    private buildUrl(mes: number, ano: number, regiao: string = 'BR'): string {
        return `${this.baseUrl}/${mes}_${ano}/PEIC/${regiao}.xls`;
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

            // Padrão do nome: peic_REGIAO_MESANO_timestamp.xls
            // Exemplo: peic_BR_62025_1735123456789.xls
            const pattern = `peic_${regiao}_${mes}${ano}_`;

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
     * Realiza o download de um arquivo Excel PEIC do servidor remoto
     * @param url URL completa do arquivo a ser baixado
     * @param identifier Identificador único para nomenclatura do arquivo
     * @returns Caminho completo do arquivo baixado
     */
    private async downloadExcelFile(url: string, identifier: string): Promise<string> {
        const fileName = `peic_${identifier}_${Date.now()}.xls`;
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
            throw new Error(`Erro ao baixar arquivo PEIC (${identifier}): ${error}`);
        }
    }

    // ========================================
    // SEÇÃO 3: MÉTODOS DE METADADOS
    // ========================================

    /**
     * Extrai metadados completos de uma planilha PEIC utilizando função otimizada
     * Processa todos os tipos de índices e seus respectivos valores
     * @param filePath Caminho completo da planilha Excel
     * @returns Array de objetos MetadadosPeic com todos os dados estruturados
     */
    private async extractMetadataFromExcel(filePath: string): Promise<MetadadosPeic[]> {
        try {
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null }) as any[][];

            // Usar a função otimizada para extrair dados estruturados
            const peicCompleta = transformJsonToPEIC(jsonData);

            // Converter para o formato MetadadosPeic
            const metadados: MetadadosPeic[] = [];

            for (const tipo of peicCompleta.peictableTipo) {
                for (const valor of tipo.valores) {
                    const metadado = new MetadadosPeic();
                    metadado.TIPOINDICE = tipo.tipo;
                    metadado.CAMPO = valor.tipo;

                    // Salvar dados brutos como string
                    metadado.TOTAL = valor.total || '';
                    metadado.ATE_10_SM = valor["até 10sm - %"] || '';
                    metadado.MAIS_DE_10_SM = valor["mais de 10sm - %"] || '';
                    metadado.NUMERO_ABSOLUTO = valor["Numero Absoluto"] || '';

                    metadados.push(metadado);
                }
            }

            return metadados;

        } catch (error) {
            throw new Error(`Erro ao extrair metadados da planilha PEIC: ${error}`);
        }
    }

    /**
     * Processa extração de metadados para todos os registros PEIC obtidos via planilha
     * Localiza arquivos já baixados e extrai metadados detalhados
     * @param idsPeic Array com IDs dos registros PEIC para processamento de metadados
     */
    private async processMetadataForPlanilhaRecords(idsPeic: string[]): Promise<void> {
        try {
            // 1. Filtrar todos os registros de PEIC do método 'Planilha'
            const registrosPlanilha = await peicRepository.find({
                where: { id: In(idsPeic) },
                order: { ANO: 'ASC', MES: 'ASC' }
            });

            const registrosMetadados = await metadadosPeicRepository.find({
                relations: {
                    peic: true
                }
            })

            if (registrosPlanilha.length === 0) {
                console.log('ℹ️ Nenhum registro PEIC do tipo Planilha encontrado');
                return;
            }

            console.log(`📊 Encontrados ${registrosPlanilha.length} registros PEIC do tipo Planilha`);

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
                metadados: MetadadosPeic[];
                peicId: string;
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
                        // Encontrar registros PEIC que correspondem a este período/região
                        const registrosDoperiodo = registrosPlanilha.filter(
                            (r) => r.MES === periodo.mes && r.ANO === periodo.ano && r.REGIAO === periodo.regiao
                        );

                        for (const registro of registrosDoperiodo) {
                            // Verificar se já existem metadados para este registro
                            const metadadosExistentes = registrosMetadados.filter(
                                (m) => m.peic && m.peic.id === registro.id
                            );

                            if (metadadosExistentes.length === 0) {
                                metadataToSaveList.push({
                                    metadados: [...metadados], // Fazer cópia dos metadados
                                    peicId: registro.id!
                                });
                                console.log(`✅ Metadados preparados para PEIC ID: ${registro.id} (${periodo.regiao} ${periodo.mes.toString().padStart(2, '0')}/${periodo.ano})`);
                            } else {
                                console.log(`ℹ️ Metadados já existem para PEIC ID: ${registro.id} (${periodo.regiao} ${periodo.mes.toString().padStart(2, '0')}/${periodo.ano})`);
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

            console.log('✅ Processamento de metadados PEIC concluído');

        } catch (error) {
            console.error('❌ Erro no processamento de metadados PEIC:', error);
            throw error;
        }
    }

    // ========================================
    // SEÇÃO 4: MÉTODOS DE BANCO DE DADOS
    // ========================================

    /**
     * Salva múltiplos registros PEIC no banco de dados de forma otimizada
     * Utiliza operação em lote para melhor performance
     * @param peicDataList Array de objetos Peic para serem salvos
     * @returns Array com os IDs dos registros salvos
     */
    private async saveBatchPeicToDatabase(peicDataList: Peic[]): Promise<string[]> {
        try {
            if (peicDataList.length === 0) {
                return [];
            }

            const peicEntities: Peic[] = [];

            for (const data of peicDataList) {
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

                peicEntities.push(peicEntity);
            }

            // Salvar todos de uma vez usando save() com array
            const savedEntities = await peicRepository.save(peicEntities);

            console.log(`💾 Total de registros PEIC salvos: ${savedEntities.length}`);

            return savedEntities.map(entity => entity.id!);
        } catch (error) {
            throw new Error(`Erro ao salvar lote de registros PEIC no banco: ${error}`);
        }
    }

    /**
     * Salva múltiplos lotes de metadados no banco de dados de forma otimizada
     * Vincula cada metadado ao seu respectivo registro PEIC
     * @param metadataToSaveList Lista de lotes de metadados para salvar
     * @param registrosPlanilha Registros PEIC para vinculação
     */
    private async saveBatchMetadataToDatabase(
        metadataToSaveList: Array<{ metadados: MetadadosPeic[]; peicId: string }>,
        registrosPlanilha: Peic[]
    ): Promise<void> {
        try {
            const allMetadataToSave: MetadadosPeic[] = [];

            // Preparar todos os metadados para salvar
            for (const item of metadataToSaveList) {
                // Buscar o registro PEIC para vincular
                const peicEntity = registrosPlanilha.find((i) => i.id === item.peicId);

                if (!peicEntity) {
                    console.log(`⚠️ Registro PEIC com ID ${item.peicId} não encontrado, pulando...`);
                    continue;
                }

                // Vincular cada metadado ao registro PEIC
                for (const metadado of item.metadados) {
                    metadado.peic = peicEntity;
                    allMetadataToSave.push(metadado);
                }
            }

            // Salvar todos os metadados de uma vez usando saveMany (mais eficiente)
            if (allMetadataToSave.length > 0) {
                await metadadosPeicRepository.save(allMetadataToSave);
                console.log(`📊 Total de metadados salvos: ${allMetadataToSave.length}`);
            }

        } catch (error) {
            throw new Error(`Erro ao salvar lotes de metadados PEIC no banco: ${error}`);
        }
    }

    /**
     * Remove todos os dados PEIC e metadados do banco de dados
     * Respeita a ordem de exclusão para manter integridade referencial
     * @returns String com log das operações realizadas
     */
    private async cleanDatabase(): Promise<string> {
        try {
            const logMessages: string[] = [];

            // Limpar metadados primeiro (respeitando foreign key constraint)
            console.log('🧹 Limpando metadados PEIC...');
            await metadadosPeicRepository.createQueryBuilder()
                .delete()
                .from(MetadadosPeic)
                .execute();
            logMessages.push('✅ Metadados PEIC limpos com sucesso');

            // Limpar registros PEIC
            console.log('🧹 Limpando registros PEIC...');
            await peicRepository.createQueryBuilder()
                .delete()
                .from(Peic)
                .execute();
            logMessages.push('✅ Registros PEIC limpos com sucesso');

            return logMessages.join('\n') + '\n';

        } catch (error) {
            return `Erro ao limpar a base de dados PEIC: ${error}\n`;
        }
    }

    // ========================================
    // SEÇÃO 5: MÉTODOS DE PROCESSAMENTO DE DADOS
    // ========================================

    /**
     * Extrai os dados completos PEIC de uma planilha Excel
     * Busca especificamente pelas seções PEIC (Percentual) e PEIC (Síntese)
     * @param filePath Caminho completo do arquivo Excel a ser processado
     * @returns Objeto Peic com todos os dados extraídos (valores como string)
     */
    private async extractCompleteDataFromExcel(filePath: string): Promise<Peic> {
        try {
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null }) as any[][];

            let percentualRow: any[] | null = null;
            let absolutoRow: any[] | null = null;

            // Buscar as linhas necessárias
            for (let i = 0; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (row && Array.isArray(row) && row.length >= 2) {
                    const firstCell = String(row[0] || '').toLowerCase().trim();

                    // Linha com percentuais - PEIC (Percentual)
                    if (firstCell.includes('peic') && firstCell.includes('percentual')) {
                        // As próximas 3 linhas contêm os dados percentuais
                        if (i + 3 < jsonData.length) {
                            percentualRow = [];
                            // Extrair dados das 3 linhas seguintes
                            for (let j = 1; j <= 3; j++) {
                                const dataRow = jsonData[i + j];
                                if (dataRow && dataRow[1]) {
                                    percentualRow.push(dataRow[1]);
                                }
                            }
                        }
                    }

                    // Linha com valores absolutos - PEIC (Síntese)
                    if (firstCell.includes('peic') && firstCell.includes('sintese')) {
                        // As próximas 3 linhas contêm os dados absolutos
                        if (i + 3 < jsonData.length) {
                            absolutoRow = [];
                            // Extrair dados das 3 linhas seguintes
                            for (let j = 1; j <= 3; j++) {
                                const dataRow = jsonData[i + j];
                                if (dataRow && dataRow[1]) {
                                    absolutoRow.push(dataRow[1]);
                                }
                            }
                        }
                    }
                }
            }

            if (!percentualRow || percentualRow.length < 3) {
                throw new Error('Dados percentuais PEIC não encontrados na planilha');
            }

            if (!absolutoRow || absolutoRow.length < 3) {
                throw new Error('Dados absolutos PEIC não encontrados na planilha');
            }

            // Processar os dados extraídos
            const peicData: Peic = {
                METODO: Metodo.PLA,
                ENDIVIDADOS_PERCENTUAL: this.parseValueToString(percentualRow[0]),
                CONTAS_EM_ATRASO_PERCENTUAL: this.parseValueToString(percentualRow[1]),
                NÃO_TERAO_CONDICOES_DE_PAGAR_PERCENTUAL: this.parseValueToString(percentualRow[2]),
                ENDIVIDADOS_ABSOLUTO: this.parseValueToString(absolutoRow[0]),
                CONTAS_EM_ATRASO_ABSOLUTO: this.parseValueToString(absolutoRow[1]),
                NAO_TERÃO_CONDICOES_DE_PAGAR_ABSOLUTO: this.parseValueToString(absolutoRow[2]),
                MES: 0, // Será definido posteriormente
                ANO: 0, // Será definido posteriormente
                REGIAO: 'BR' as any // Será definido posteriormente
            };

            return peicData;
        } catch (error) {
            throw new Error(`Erro ao processar arquivo PEIC: ${error}`);
        }
    }

    // ========================================
    // SEÇÃO 6: MÉTODOS DE WEB SCRAPING
    // ========================================

    /**
     * Processa e valida valores extraídos da tabela PEIC mantendo formato string
     * @param values Array de strings com os valores da tabela (6 valores: 3 percentuais + 3 absolutos)
     * @returns Objeto com os dados PEIC formatados
     */
    private processPeicTableValues(values: string[]): any {
        console.log('🔄 Processando valores PEIC:', values);

        if (values.length < 6) {
            throw new Error(`Dados PEIC insuficientes. Esperado: 6 valores, Encontrado: ${values.length}`);
        }

        return {
            ENDIVIDADOS_PERCENTUAL: this.parseValueToString(values[0]),
            CONTAS_EM_ATRASO_PERCENTUAL: this.parseValueToString(values[1]),
            NÃO_TERAO_CONDICOES_DE_PAGAR_PERCENTUAL: this.parseValueToString(values[2]),
            ENDIVIDADOS_ABSOLUTO: this.parseValueToString(values[3]),
            CONTAS_EM_ATRASO_ABSOLUTO: this.parseValueToString(values[4]),
            NAO_TERÃO_CONDICOES_DE_PAGAR_ABSOLUTO: this.parseValueToString(values[5])
        };
    }

    /**
     * Realiza autenticação no site PEIC utilizando credenciais do ambiente
     * @param page Instância da página do Playwright
     */
    private async performLogin(page: any): Promise<void> {
        console.log('🔐 Fazendo login no site PEIC...');

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

    /**
     * Extrai dados PEIC do site via web scraping para um período específico
     * @param page Instância da página do Playwright
     * @param mes Mês do período desejado (1-12)
     * @param ano Ano do período desejado
     * @param regiao Região dos dados (ex: 'BR', 'SP')
     * @returns Objeto Peic com dados extraídos via web scraping
     */
    private async extractDataFromWebsite(page: any, mes: number, ano: number, regiao: string): Promise<Peic> {
        console.log(`📊 Extraindo dados do site PEIC para ${regiao} ${mes}/${ano}`);

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

    /**
     * Extrai e processa dados específicos da tabela PEIC no site
     * @param page Instância da página do Playwright
     * @param mes Mês do período para localização na tabela
     * @param ano Ano do período para localização na tabela
     * @returns Dados processados da tabela PEIC
     */
    private async extractCompleteTableData(page: any, mes: number, ano: number): Promise<any> {
        // Mapear mês para formato abreviado em inglês (JUL 25)
        const meses = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const mesAbrev = meses[mes - 1];
        const anoAbrev = ano.toString().slice(-2); // Pegar últimos 2 dígitos
        const periodoTarget = `${mesAbrev} ${anoAbrev}`;

        console.log(`🔍 Procurando período PEIC: ${periodoTarget}`);

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

                    // Validar se temos pelo menos 7 valores (período + 6 dados)
                    if (values.length < 7) {
                        console.log('⚠️ Tentando separação alternativa por espaços múltiplos');
                        const altValues = rowData.split(/\s{2,}/).filter(val => val.trim() !== '');
                        console.log('📊 Valores alternativos:', altValues);

                        if (altValues.length >= 7) {
                            return this.processPeicTableValues(altValues.slice(1)); // Pular a primeira coluna (período)
                        } else {
                            throw new Error(`Dados insuficientes na tabela. Esperado: 7 valores, Encontrado: ${altValues.length}`);
                        }
                    }

                    return this.processPeicTableValues(values.slice(1)); // Pular a primeira coluna (período)
                }
            }

            // Se não encontrou o período, mostrar períodos disponíveis
            console.log('🔍 Períodos disponíveis na tabela PEIC:');
            data.forEach((rowData: string) => {
                if (rowData && rowData.trim()) {
                    const firstValue = rowData.split(/[\t\s]+/)[0];
                    if (firstValue && firstValue.match(/[A-Z]{3}\s?\d{2}/)) {
                        console.log(`   - "${firstValue.trim()}"`);
                    }
                }
            });

            throw new Error(`Período ${periodoTarget} não encontrado na tabela PEIC`);

        } catch (error) {
            console.error('❌ Erro ao extrair dados da tabela PEIC:', error);
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
        const browser = await chromium.launch({ headless: false });

        try {
            const page = await browser.newPage();

            // Fazer login
            await this.performLogin(page);

            let sucessosWebScraping = 0;
            const webScrapingDataList: Peic[] = [];

            for (const error of errorList) {
                try {
                    console.log(LogMessages.webScrapingInicio('PEIC', error.regiao, error.mes, error.ano));

                    const data = await this.extractDataFromWebsite(page, error.mes, error.ano, error.regiao);

                    // Acumular dados em vez de salvar imediatamente
                    webScrapingDataList.push(data);

                    console.log(LogMessages.webScrapingSucesso('PEIC', error.regiao, error.mes, error.ano));
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
                    console.log(LogMessages.webScrapingFalha('PEIC', error.regiao, error.mes, error.ano, scrapingError));

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
                await this.saveBatchPeicToDatabase(webScrapingDataList);
                console.log(`✅ Todos os registros de web scraping foram salvos com sucesso!`);
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

    // ========================================
    // SEÇÃO 7: MÉTODO PRINCIPAL PÚBLICO
    // ========================================

    /**
     * Método principal que executa o processamento completo dos dados PEIC
     * Inclui download, extração, salvamento, retry via web scraping e processamento de metadados
     * @param regioes Array de regiões para processamento (padrão: ['BR'])
     * @returns Objeto IServiceResult com estatísticas completas da execução
     */
    public async processAllPeicDataWithMonitoring(regioes: string[] = ['BR']): Promise<IServiceResult> {
        const startTime = Date.now();
        console.log('🚀 Iniciando processamento completo dos dados PEIC com monitoramento...\n');

        const resultadoLimpeza = await this.cleanDatabase();
        console.log(resultadoLimpeza);

        console.log(`📍 Regiões a processar: ${regioes.join(', ')}\n`);

        const periods = generateServicePeriods('PEIC');
        const tasks: ITask[] = [];
        let registrosPlanilha = 0;
        let registrosWebScraping = 0;
        let erros: IErrorService[] = [];
        let savedIds: string[] = [];

        // Array para acumular todos os dados PEIC antes de salvar
        const peicDataList: Peic[] = [];

        for (const period of periods) {
            for (const regiao of regioes) {
                try {
                    console.log(LogMessages.processando('PEIC', regiao, period.mes, period.ano));

                    const currentUrl = this.buildUrl(period.mes, period.ano, regiao);
                    const currentFilePath = await this.downloadExcelFile(currentUrl, `${regiao}_${period.mes}${period.ano}`);

                    // Extrair dados completos diretamente da planilha (percentuais + absolutos)
                    const completeData = await this.extractCompleteDataFromExcel(currentFilePath);

                    const peicData: Peic = {
                        ...completeData,
                        MES: period.mes,
                        ANO: period.ano,
                        REGIAO: regiao as Regiao
                    };

                    peicDataList.push(peicData);

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

        // Salvar todos os registros PEIC de uma vez
        if (peicDataList.length > 0) {
            console.log(`\n💾 Salvando ${peicDataList.length} registros PEIC no banco de dados...`);
            savedIds = await this.saveBatchPeicToDatabase(peicDataList);
            console.log(`✅ Todos os registros PEIC foram salvos com sucesso!`);
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
            servico: 'PEIC',
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

        console.log(`\n=== Processamento PEIC concluído ===`);
        console.log(`Sucessos: ${sucessos}`);
        console.log(`Falhas: ${falhas}`);
        console.log(`Tempo: ${Math.round(tempoExecucao / 60)} minutos`);
        console.log(`Registros por planilha: ${registrosPlanilha}`);
        console.log(`Registros por web scraping: ${registrosWebScraping}`);

        // Nova etapa: processar metadados para registros do tipo Planilha
        if (savedIds.length) {
            console.log('\n🔄 Iniciando processamento de metadados PEIC...');
            await this.processMetadataForPlanilhaRecords(savedIds);
        }

        // Limpeza da pasta temp ao final da execução
        await cleanupServiceTempFolder('peic', this.TEMP_DIR);

        return resultado;
    }
}
