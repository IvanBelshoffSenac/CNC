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
    transformJsonToICF
} from '../shared/utils';
import { In } from 'typeorm';

export class IcfService {

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
     * Constrói a URL completa para download do arquivo Excel ICF
     * @param mes Mês do período desejado (1-12)
     * @param ano Ano do período desejado
     * @param regiao Região do arquivo (padrão: 'BR')
     * @returns URL completa do arquivo
     */
    private buildUrl(mes: number, ano: number, regiao: string = 'BR'): string {
        return `${this.baseUrl}/${mes}_${ano}/ICF/${regiao}.xls`;
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
     * Realiza o download de um arquivo Excel ICF do servidor remoto
     * @param url URL completa do arquivo a ser baixado
     * @param identifier Identificador único para nomenclatura do arquivo
     * @returns Caminho completo do arquivo baixado
     */
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

    /**
     * Valida se o layout da planilha ICF está conforme o padrão esperado
     * Compara com arquivo de referência na pasta baseFiles
     * @param filePath Caminho da planilha atual a ser validada
     * @returns Objeto com resultado da validação e detalhes das inconsistências
     */
    private async isExcelLayoutValid(filePath: string): Promise<{ valid: boolean, inconsistencies?: string }> {
        try {
            console.log('🔍 Validando layout ICF baseado em padrões estruturais...');

            const metadados = await this.extractMetadataFromExcel(filePath);
            const inconsistencias: string[] = [];

            // ========================================
            // VALIDAÇÕES PADRÃO ICF
            // ========================================

            // 1. Detectar layout (histórico vs moderno) baseado na quantidade de metadados
            const layoutHistorico = metadados.length === 46; // Layout 2012-2020 (seção ICF expandida)
            const layoutModerno = metadados.length === 45;   // Layout 2021+ (seção ICF concisa)
            
            let expectedMetadadosCount: number;
            let layoutTipo: string;
            
            if (layoutHistorico) {
                expectedMetadadosCount = 46;
                layoutTipo = 'histórico (2012-2020)';
                console.log('🔍 Layout ICF histórico detectado (2012-2020): 46 metadados');
            } else if (layoutModerno) {
                expectedMetadadosCount = 45;
                layoutTipo = 'moderno (2021+)';
                console.log('🔍 Layout ICF moderno detectado (2021+): 45 metadados');
            } else {
                expectedMetadadosCount = metadados.length > 45 ? 46 : 45;
                layoutTipo = 'desconhecido';
                inconsistencias.push(`Quantidade de metadados inesperada: ${metadados.length} (esperado: 45 ou 46)`);
            }

            // Validar quantidade de metadados apenas se não for um layout conhecido
            if (!layoutHistorico && !layoutModerno) {
                inconsistencias.push(`Total de metadados: ${metadados.length} (esperado: 45 para moderno ou 46 para histórico)`);
            }

            // 2. Validar estrutura dos tipos de índices ICF baseado no layout detectado
            const expectedTipos = layoutHistorico ? [
                // Layout histórico: 7 seções (ICF Variação Mensal incluída em Momento para Duráveis)
                'Emprego Atual',
                'Perspectiva Profissional', 
                'Renda Atual',
                'Compra a Prazo (Acesso ao crédito)',
                'Nível de Consumo Atual',
                'Perspectiva de Consumo',
                'Momento para Duráveis'
            ] : [
                // Layout moderno: 8 seções (ICF Variação Mensal separada)
                'Emprego Atual',
                'Perspectiva Profissional', 
                'Renda Atual',
                'Compra a Prazo (Acesso ao crédito)',
                'Nível de Consumo Atual',
                'Perspectiva de Consumo',
                'Momento para Duráveis',
                'ICF (Variação Mensal)'
            ];

            const tiposEncontrados = [...new Set(metadados.map(m => m.TIPOINDICE))];
            
            for (const tipoEsperado of expectedTipos) {
                if (!tiposEncontrados.includes(tipoEsperado)) {
                    inconsistencias.push(`Tipo de índice ausente: ${tipoEsperado}`);
                }
            }

            // 3. Validar quantidade de tipos baseada no layout
            const expectedTipoCount = layoutHistorico ? 7 : 8;
            if (tiposEncontrados.length !== expectedTipoCount) {
                inconsistencias.push(`Quantidade de tipos: ${tiposEncontrados.length} (esperado: ${expectedTipoCount} para layout ${layoutTipo})`);
            }

            // 4. Validar campos esperados para cada tipo baseado no layout detectado
            const expectedCamposPorTipo = layoutHistorico ? {
                // Layout histórico (2012-2020): ICF (Variação Mensal) tem 15 campos (expandida)
                'Emprego Atual': [
                    'Mais seguro', 'Menos seguro', 'Igual ao ano passado', 'Estou desempregado', 'Não sabe / Não respondeu', 'Índice'
                ],
                'Perspectiva Profissional': [
                    'Sim (Positiva)', 'Não (Negativa)', 'Não sabe', 'Não respondeu', 'Índice'
                ],
                'Renda Atual': [
                    'Melhor', 'Pior', 'Igual a do ano passado', 'Não sabe / não respondeu', 'Índice'
                ],
                'Compra a Prazo (Acesso ao crédito)': [
                    'Mais Fácil', 'Mais Difícil', 'Igual ao ano passado', 'Não sabe / não respondeu', 'Índice'
                ],
                'Nível de Consumo Atual': [
                    'Estamos comprando mais (Maior)', 'Estamos comprando menos (Menor)', 'Estamos comprando a mesma coisa (Igual)', 'Não sabe / Não respondeu', 'Índice'
                ],
                'Perspectiva de Consumo': [
                    'Maior que o segundo semestre do ano passado (Maior)', 'Menor que o segundo semestre do ano passado (Menor)', 'Igual ao segundo semestre do ano passado (Igual) ', 'Não sabe / Não respondeu', 'Índice'
                ],
                'Momento para Duráveis': [
                    // Layout histórico: Momento para Duráveis incluiu toda a seção ICF (Variação Mensal) - 15 campos
                    'Bom', 'Mau', 'Não Sabe', 'Não Respondeu', 'Índice',
                    'ICF (Variação Mensal)', 'Emprego Atual', 'Perspectiva Profissional', 'Renda Atual',
                    'Compra a Prazo (Acesso ao crédito)', 'Nível de Consumo Atual', 'Perspectiva de Consumo',
                    'Momento para Duráveis', 'Índice (Variação Mensal)', 'Índice (Em Pontos)'
                ]
                // Nota: Layout histórico não tem seção separada "ICF (Variação Mensal)"
            } : {
                // Layout moderno (2021+): ICF (Variação Mensal) tem 9 campos (concisa)
                'Emprego Atual': [
                    'Mais seguro', 'Menos seguro', 'Igual ao ano passado', 'Estou desempregado', 'Não sabe / Não respondeu', 'Índice'
                ],
                'Perspectiva Profissional': [
                    'Sim (Positiva)', 'Não (Negativa)', 'Não sabe', 'Não respondeu', 'Índice'
                ],
                'Renda Atual': [
                    'Melhor', 'Pior', 'Igual a do ano passado', 'Não sabe / não respondeu', 'Índice'
                ],
                'Compra a Prazo (Acesso ao crédito)': [
                    'Mais Fácil', 'Mais Difícil', 'Igual ao ano passado', 'Não sabe / não respondeu', 'Índice'
                ],
                'Nível de Consumo Atual': [
                    'Estamos comprando mais (Maior)', 'Estamos comprando menos (Menor)', 'Estamos comprando a mesma coisa (Igual)', 'Não sabe / Não respondeu', 'Índice'
                ],
                'Perspectiva de Consumo': [
                    'Maior que o segundo semestre do ano passado (Maior)', 'Menor que o segundo semestre do ano passado (Menor)', 'Igual ao segundo semestre do ano passado (Igual) ', 'Não sabe / Não respondeu', 'Índice'
                ],
                'Momento para Duráveis': [
                    'Bom', 'Mau', 'Não Sabe', 'Não Respondeu', 'Índice'
                ],
                'ICF (Variação Mensal)': [
                    'Emprego Atual', 'Perspectiva Profissional', 'Renda Atual', 'Compra a Prazo (Acesso ao crédito)',
                    'Nível de Consumo Atual', 'Perspectiva de Consumo', 'Momento para Duráveis',
                    'Índice (Variação Mensal)', 'Índice (Em Pontos)'
                ]
            };

            // Validar campos por tipo
            for (const [tipo, camposEsperados] of Object.entries(expectedCamposPorTipo)) {
                const metadadosDoTipo = metadados.filter(m => m.TIPOINDICE === tipo);
                const camposEncontrados = metadadosDoTipo.map(m => m.CAMPO);

                // Validação especial para layout histórico
                if (layoutHistorico && tipo === 'Momento para Duráveis') {
                    // Layout histórico: "Momento para Duráveis" deve ter exatamente 15 campos
                    if (metadadosDoTipo.length !== 15) {
                        inconsistencias.push(`Tipo "${tipo}": ${metadadosDoTipo.length} campos (esperado: 15 para layout histórico)`);
                    }
                    
                    // Verificar se contém os campos essenciais do Momento para Duráveis
                    const camposEssenciais = ['Bom', 'Mau', 'Não Sabe', 'Não Respondeu', 'Índice'];
                    for (const campoEssencial of camposEssenciais) {
                        if (!camposEncontrados.includes(campoEssencial)) {
                            inconsistencias.push(`Campo essencial ausente no tipo "${tipo}": ${campoEssencial}`);
                        }
                    }
                    
                    // Verificar se contém os campos da variação mensal
                    const camposVariacao = ['ICF (Variação Mensal)', 'Índice (Variação Mensal)', 'Índice (Em Pontos)'];
                    for (const campoVariacao of camposVariacao) {
                        if (!camposEncontrados.includes(campoVariacao)) {
                            inconsistencias.push(`Campo de variação ausente no tipo "${tipo}": ${campoVariacao}`);
                        }
                    }
                    
                } else if (layoutHistorico && tipo === 'ICF (Variação Mensal)') {
                    // Layout histórico não deve ter seção separada "ICF (Variação Mensal)"
                    if (metadadosDoTipo.length > 0) {
                        inconsistencias.push(`Tipo "${tipo}" não deveria existir no layout histórico (incluído em "Momento para Duráveis")`);
                    }
                    
                } else {
                    // Validação padrão para outros tipos
                    for (const campoEsperado of camposEsperados) {
                        if (!camposEncontrados.includes(campoEsperado)) {
                            inconsistencias.push(`Campo ausente no tipo "${tipo}": ${campoEsperado}`);
                        }
                    }

                    // Verificar quantidade exata de campos por tipo
                    if (metadadosDoTipo.length !== camposEsperados.length) {
                        inconsistencias.push(`Tipo "${tipo}": ${metadadosDoTipo.length} campos (esperado: ${camposEsperados.length})`);
                    }
                }
            }

            // 5. Validar se todos os tipos têm pelo menos um campo "Índice"
            for (const tipo of expectedTipos) {
                const metadadosDoTipo = metadados.filter(m => m.TIPOINDICE === tipo);
                const temIndice = metadadosDoTipo.some(m => m.CAMPO && m.CAMPO.includes('Índice'));
                
                if (!temIndice) {
                    inconsistencias.push(`Tipo "${tipo}": sem campo índice`);
                }
            }

            // 4. Validar campos obrigatórios não vazios
            const camposObrigatorios = ['TIPOINDICE', 'CAMPO'];
            for (const metadado of metadados) {
                for (const campo of camposObrigatorios) {
                    if (!metadado[campo] || metadado[campo].trim() === '') {
                        inconsistencias.push(`Campo obrigatório vazio: ${campo} no registro ${metadado.CAMPO || 'indefinido'}`);
                    }
                }
            }

            const isValid = inconsistencias.length === 0;
            
            if (isValid) {
                console.log(`✅ Layout ICF validado com sucesso: ${metadados.length} metadados extraídos (layout ${layoutTipo})`);
                return { valid: true };
            } else {
                const inconsistenciaStr = inconsistencias.slice(0, 5).join('; ') + 
                    (inconsistencias.length > 5 ? ` e mais ${inconsistencias.length - 5} problemas` : '');
                
                console.log(`⚠️ Layout ICF com inconsistências: ${inconsistencias.length} problemas detectados (layout ${layoutTipo})`);
                console.log(`📋 Primeiras inconsistências: ${inconsistencias.slice(0, 3).join('; ')}`);
                
                return { 
                    valid: false, 
                    inconsistencies: inconsistenciaStr 
                };
            }

        } catch (error) {
            console.log(`❌ Erro ao validar layout da planilha ICF: ${error}`);
            // Em caso de erro, assumir layout padrão para não interromper processamento
            return { valid: true, inconsistencies: `Erro na validação: ${error}` };
        }
    }

    /**
     * Encontra a linha do cabeçalho de uma seção específica
     * @param data Dados da planilha
     * @param sectionName Nome da seção a procurar
     * @returns Array da linha encontrada ou null
     */
    private findSectionHeaderRow(data: any[][], sectionName: string): any[] | null {
        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            if (row && row[0] && typeof row[0] === 'string' && row[0].includes(sectionName)) {
                return row;
            }
        }
        return null;
    }

    // ========================================
    // SEÇÃO 3: MÉTODOS DE METADADOS
    // ========================================

    /**
     * Extrai metadados completos de uma planilha ICF utilizando função otimizada
     * Processa todos os tipos de índices e seus respectivos valores
     * @param filePath Caminho completo da planilha Excel
     * @returns Array de objetos MetadadosIcf com todos os dados estruturados
     */
    private async extractMetadataFromExcel(filePath: string): Promise<MetadadosIcf[]> {
        try {
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null }) as any[][];

            // Usar a função otimizada para extrair dados estruturados
            const icfCompleta = transformJsonToICF(jsonData);

            console.log(icfCompleta);

            // Converter para o formato MetadadosIcf
            const metadados: MetadadosIcf[] = [];

            for (const tipo of icfCompleta.icftableTipo) {
                for (const valor of tipo.valores) {
                    const metadado = new MetadadosIcf();
                    metadado.TIPOINDICE = tipo.tipo;
                    metadado.CAMPO = valor.tipo;

                    // Salvar dados brutos como string
                    metadado.TOTAL = this.parseValueToString(valor.total);
                    metadado.ATE_10_SM = this.parseValueToString(valor["até 10sm - %"]);
                    metadado.MAIS_DE_10_SM = this.parseValueToString(valor["mais de 10sm - %"]);
                    metadado.INDICE = valor.indice;

                    metadados.push(metadado);
                }
            }

            return metadados;

        } catch (error) {
            throw new Error(`Erro ao extrair metadados da planilha ICF: ${error}`);
        }
    }

    /**
     * Processa extração de metadados para todos os registros ICF obtidos via planilha
     * Localiza arquivos já baixados e extrai metadados detalhados
     * @param idsIcf Array com IDs dos registros ICF para processamento de metadados
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
            for (const periodo of periodos) {
                try {
                    console.log(`📥 Processando metadados para período ${periodo.regiao} ${periodo.mes.toString().padStart(2, '0')}/${periodo.ano}...`);

                    // Localizar arquivo já baixado na pasta temporária
                    const filePath = await this.findExistingExcelFile(periodo.regiao, periodo.mes, periodo.ano);

                    if (!filePath) {
                        console.log(`⚠️ Arquivo não encontrado para ${periodo.regiao} ${periodo.mes.toString().padStart(2, '0')}/${periodo.ano} - pulando processamento de metadados`);
                        continue;
                    }

                    // Extrair metadados da planilha existente
                    const metadados = await this.extractMetadataFromExcel(filePath);

                    if (metadados.length > 0) {
                        // Buscar todos os registros ICF que correspondem a este período/região
                        const registrosParaPeriodo = registrosPlanilha.filter((r) =>
                            r.MES === periodo.mes && r.ANO === periodo.ano && r.REGIAO === periodo.regiao
                        );

                        // Verificar se já existem metadados para este período
                        const metadatosExistentes = registrosMetadados.filter((m) =>
                            m.icf && registrosParaPeriodo.some((r) => r.id === m.icf.id)
                        );

                        if (metadatosExistentes.length === 0 && registrosParaPeriodo.length > 0) {
                            // Salvar metadados individualmente para cada registro ICF do período
                            for (const registro of registrosParaPeriodo) {
                                await this.saveIndividualMetadataToDatabase(metadados, registro);
                            }
                            console.log(`✅ Metadados processados e salvos para ${registrosParaPeriodo.length} registros ICF`);
                        } else {
                            console.log(`ℹ️ Metadados já existem para período ${periodo.regiao} ${periodo.mes.toString().padStart(2, '0')}/${periodo.ano}`);
                        }
                    } else {
                        console.log(`⚠️ Nenhum metadado extraído para período ${periodo.regiao} ${periodo.mes.toString().padStart(2, '0')}/${periodo.ano}`);
                    }

                } catch (error) {
                    console.log(`❌ Erro ao processar metadados para período ${periodo.regiao} ${periodo.mes.toString().padStart(2, '0')}/${periodo.ano}: ${error}`);
                }
            }

            console.log('✅ Processamento de metadados ICF concluído');

        } catch (error) {
            console.error('❌ Erro no processamento de metadados ICF:', error);
            throw error;
        }
    }

    // ========================================
    // SEÇÃO 4: MÉTODOS DE BANCO DE DADOS
    // ========================================

    /**
     * Salva um único registro ICF no banco de dados
     * Utilizado para evitar problemas de performance em produção com grandes volumes
     * @param icfData Objeto Icf para ser salvo
     * @returns ID do registro salvo
     */
    private async saveIndividualIcfToDatabase(icfData: Icf): Promise<string> {
        try {
            const icfEntity = new Icf();
            icfEntity.NC_PONTOS = icfData.NC_PONTOS;
            icfEntity.ATE_10_SM_PONTOS = icfData.ATE_10_SM_PONTOS;
            icfEntity.MAIS_DE_10_SM_PONTOS = icfData.MAIS_DE_10_SM_PONTOS;
            icfEntity.NC_PERCENTUAL = icfData.NC_PERCENTUAL;
            icfEntity.ATE_10_SM_PERCENTUAL = icfData.ATE_10_SM_PERCENTUAL;
            icfEntity.MAIS_DE_10_SM_PERCENTUAL = icfData.MAIS_DE_10_SM_PERCENTUAL;
            icfEntity.MES = icfData.MES;
            icfEntity.ANO = icfData.ANO;
            icfEntity.REGIAO = icfData.REGIAO;
            icfEntity.METODO = icfData.METODO;

            const savedEntity = await icfRepository.save(icfEntity);
            console.log(`💾 Registro ICF salvo: ${icfData.REGIAO} ${icfData.MES.toString().padStart(2, '0')}/${icfData.ANO}`);

            return savedEntity.id!;
        } catch (error) {
            throw new Error(`Erro ao salvar registro ICF individual no banco: ${error}`);
        }
    }

    /**
     * Salva múltiplos registros ICF no banco de dados de forma otimizada
     * Utiliza operação em lote para melhor performance
     * @param icfDataList Array de objetos Icf para serem salvos
     * @returns Array com os IDs dos registros salvos
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
     * Salva metadados individuais no banco de dados
     * Vincula cada metadado ao seu respectivo registro ICF
     * @param metadados Array de metadados para salvar
     * @param icfEntity Registro ICF para vinculação
     */
    private async saveIndividualMetadataToDatabase(
        metadados: MetadadosIcf[],
        icfEntity: Icf
    ): Promise<void> {
        try {
            if (metadados.length === 0) {
                return;
            }

            // Vincular cada metadado ao registro ICF
            const metadatosToSave: MetadadosIcf[] = [];
            for (const metadado of metadados) {
                metadado.icf = icfEntity;
                metadatosToSave.push(metadado);
            }

            // Salvar metadados
            await metadadosIcfRepository.save(metadatosToSave);
            console.log(`📊 ${metadatosToSave.length} metadados salvos para ICF ID: ${icfEntity.id}`);

        } catch (error) {
            throw new Error(`Erro ao salvar metadados individuais no banco: ${error}`);
        }
    }

    /**
     * Salva múltiplos lotes de metadados no banco de dados de forma otimizada
     * Vincula cada metadado ao seu respectivo registro ICF
     * @param metadataToSaveList Lista de lotes de metadados para salvar
     * @param registrosPlanilha Registros ICF para vinculação
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
     * Remove todos os dados ICF e metadados do banco de dados
     * Respeita a ordem de exclusão para manter integridade referencial
     * @returns String com log das operações realizadas
     */
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

    // ========================================
    // SEÇÃO 5: MÉTODOS DE PROCESSAMENTO DE DADOS
    // ========================================

    /**
     * Calcula variações mensais ausentes para períodos que não possuem "Índice (Variação Mensal)"
     * Usa a fórmula: ((ICF_atual / ICF_anterior) - 1) × 100%
     * Apenas retorna períodos que conseguiram calcular com sucesso
     * @param periodsWithMissingVariation Lista de períodos que falharam por falta de variação mensal
     * @returns Lista corrigida de dados ICF (apenas com sucessos)
     */
    private async calculateMissingVariations(periodsWithMissingVariation: IErrorService[]): Promise<Icf[]> {

        console.log(`\n🧮 Calculando variações mensais ausentes para ${periodsWithMissingVariation.length} períodos...`);

        const correctedData: Icf[] = [];
        const successfulCalculations: IErrorService[] = [];

        for (const period of periodsWithMissingVariation) {
            try {
                console.log(`📊 Processando período com variação ausente: ${period.regiao} ${period.mes.toString().padStart(2, '0')}/${period.ano}`);

                // 1. Localizar arquivo Excel do período atual
                const currentFilePath = await this.findExistingExcelFile(period.regiao, period.mes, period.ano);
                if (!currentFilePath) {
                    console.log(`⚠️ Arquivo não encontrado para ${period.regiao} ${period.mes}/${period.ano}, período será ignorado`);
                    continue;
                }

                // 2. Extrair apenas os pontos do período atual (sem variação mensal)
                const currentPoints = await this.extractPointsOnlyFromExcel(currentFilePath);

                // 3. Calcular período anterior
                let prevMes = period.mes - 1;
                let prevAno = period.ano;
                if (prevMes === 0) {
                    prevMes = 12;
                    prevAno = period.ano - 1;
                }

                // 4. Localizar arquivo Excel do período anterior
                const prevFilePath = await this.findExistingExcelFile(period.regiao, prevMes, prevAno);
                if (!prevFilePath) {
                    console.log(`⚠️ Arquivo do período anterior não encontrado (${period.regiao} ${prevMes.toString().padStart(2, '0')}/${prevAno}), período será ignorado`);
                    continue;
                }

                // 5. Extrair pontos do período anterior
                const prevPoints = await this.extractPointsOnlyFromExcel(prevFilePath);

                // 6. Calcular variações mensais
                const variations = this.calculateVariationPercentages(currentPoints, prevPoints);

                // 7. Criar objeto ICF completo com variações calculadas
                const icfData: Icf = {
                    NC_PONTOS: currentPoints.NC_PONTOS,
                    ATE_10_SM_PONTOS: currentPoints.ATE_10_SM_PONTOS,
                    MAIS_DE_10_SM_PONTOS: currentPoints.MAIS_DE_10_SM_PONTOS,
                    NC_PERCENTUAL: variations.NC_PERCENTUAL,
                    ATE_10_SM_PERCENTUAL: variations.ATE_10_SM_PERCENTUAL,
                    MAIS_DE_10_SM_PERCENTUAL: variations.MAIS_DE_10_SM_PERCENTUAL,
                    MES: period.mes,
                    ANO: period.ano,
                    REGIAO: period.regiao as Regiao,
                    METODO: Metodo.PLA
                };

                // Salvar registro individual
                const savedId = await this.saveIndividualIcfToDatabase(icfData);
                correctedData.push(icfData);
                successfulCalculations.push(period);
                console.log(`✅ Variação calculada e salva para ${period.regiao} ${period.mes.toString().padStart(2, '0')}/${period.ano}`);

            } catch (error) {
                console.log(`❌ Erro ao calcular variação para ${period.regiao} ${period.mes.toString().padStart(2, '0')}/${period.ano}: ${error}`);
                console.log(`⚠️ Período ${period.regiao} ${period.mes.toString().padStart(2, '0')}/${period.ano} será ignorado completamente`);
            }
        }

        const ignoredPeriods = periodsWithMissingVariation.length - successfulCalculations.length;
        console.log(`✅ Processamento de variações concluído.`);
        console.log(`   📊 Períodos calculados com sucesso: ${successfulCalculations.length}`);
        console.log(`   ⚠️ Períodos ignorados (sem período anterior): ${ignoredPeriods}`);
        console.log(`   📈 Total de registros finais: ${correctedData.length}`);

        return correctedData;
    }

    /**
     * Extrai apenas os pontos ICF de uma planilha (sem variação mensal)
     * Busca especificamente pela linha 'Índice (Em Pontos)'
     * @param filePath Caminho completo do arquivo Excel
     * @returns Objeto com apenas os pontos extraídos
     */
    private async extractPointsOnlyFromExcel(filePath: string): Promise<{ NC_PONTOS: string, ATE_10_SM_PONTOS: string, MAIS_DE_10_SM_PONTOS: string }> {
        try {
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null }) as any[][];

            let pontosRow: any[] | null = null;

            // Buscar linha com pontos
            for (let i = 0; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (row && Array.isArray(row) && row.length >= 4) {
                    const firstCell = String(row[0] || '').toLowerCase().trim();

                    // Linha com os pontos
                    if (firstCell.includes('índice (em pontos)') || firstCell.includes('índice(em pontos)')) {
                        pontosRow = row;
                        break;
                    }
                }
            }

            if (!pontosRow) {
                throw new Error('Linha "Índice (Em Pontos)" não encontrada na planilha ICF');
            }

            // Extrair os pontos (colunas 1, 2, 3) - mantendo como string
            const pontosData = pontosRow.slice(1, 4).map(val => String(val || ''));

            return {
                NC_PONTOS: pontosData[0],
                ATE_10_SM_PONTOS: pontosData[1],
                MAIS_DE_10_SM_PONTOS: pontosData[2]
            };

        } catch (error) {
            throw new Error(`Erro ao extrair pontos da planilha ICF: ${error}`);
        }
    }

    /**
     * Calcula variações percentuais mensais usando a fórmula: ((atual / anterior) - 1) × 100%
     * @param currentPoints Pontos do período atual
     * @param prevPoints Pontos do período anterior
     * @returns Objeto com variações calculadas como string
     */
    private calculateVariationPercentages(
        currentPoints: { NC_PONTOS: string, ATE_10_SM_PONTOS: string, MAIS_DE_10_SM_PONTOS: string },
        prevPoints: { NC_PONTOS: string, ATE_10_SM_PONTOS: string, MAIS_DE_10_SM_PONTOS: string }
    ): { NC_PERCENTUAL: string, ATE_10_SM_PERCENTUAL: string, MAIS_DE_10_SM_PERCENTUAL: string } {

        const calculateVariation = (current: string, previous: string): string => {
            try {
                const currentVal = parseFloat(current.replace(',', '.'));
                const prevVal = parseFloat(previous.replace(',', '.'));

                if (isNaN(currentVal) || isNaN(prevVal) || prevVal === 0) {
                    return '0';
                }

                // Fórmula: ((atual / anterior) - 1) × 100%
                const variation = ((currentVal / prevVal) - 1) * 100;

                // Retornar o valor completo sem arredondamento, apenas convertendo ponto para vírgula
                return variation.toString().replace('.', ',');

            } catch (error) {
                console.log(`⚠️ Erro ao calcular variação: atual=${current}, anterior=${previous}`);
                return '0';
            }
        };

        return {
            NC_PERCENTUAL: calculateVariation(currentPoints.NC_PONTOS, prevPoints.NC_PONTOS),
            ATE_10_SM_PERCENTUAL: calculateVariation(currentPoints.ATE_10_SM_PONTOS, prevPoints.ATE_10_SM_PONTOS),
            MAIS_DE_10_SM_PERCENTUAL: calculateVariation(currentPoints.MAIS_DE_10_SM_PONTOS, prevPoints.MAIS_DE_10_SM_PONTOS)
        };
    }

    /**
     * Extrai os dados completos ICF de uma planilha Excel
     * Busca especificamente pelas linhas 'Índice (Em Pontos)' e 'Índice (Variação Mensal)'
     * Retorna dados parciais quando variação mensal não está disponível
     * @param filePath Caminho completo do arquivo Excel a ser processado
     * @returns Objeto Icf com todos os dados extraídos (valores como string)
     */
    private async extractCompleteDataFromExcel(filePath: string): Promise<{ data: Icf, hasVariation: boolean }> {
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

            // Extrair os pontos (colunas 1, 2, 3) - mantendo como string
            const pontosData = pontosRow.slice(1, 4).map(val => String(val || ''));

            let percentuaisData: string[];
            let hasVariation = true;

            if (!percentuaisRow) {
                // Se não encontrou variação mensal, usar valores zerados
                console.log('⚠️ Linha "Índice (Variação Mensal)" não encontrada - usando valores zerados');
                percentuaisData = ['0,0', '0,0', '0,0'];
                hasVariation = false;
            } else {
                // Extrair os percentuais (colunas 1, 2, 3) - mantendo como string
                percentuaisData = percentuaisRow.slice(1, 4).map(val => String(val || ''));
            }

            const data: Icf = {
                NC_PONTOS: pontosData[0],
                ATE_10_SM_PONTOS: pontosData[1],
                MAIS_DE_10_SM_PONTOS: pontosData[2],
                NC_PERCENTUAL: percentuaisData[0],
                ATE_10_SM_PERCENTUAL: percentuaisData[1],
                MAIS_DE_10_SM_PERCENTUAL: percentuaisData[2],
                MES: 0, // Será definido posteriormente
                ANO: 0, // Será definido posteriormente
                REGIAO: 'BR' as any, // Será definido posteriormente
                METODO: Metodo.PLA
            };

            return { data, hasVariation };
        } catch (error) {
            throw new Error(`Erro ao processar arquivo Excel ICF: ${error}`);
        }
    }

    // ========================================
    // SEÇÃO 6: MÉTODOS DE WEB SCRAPING
    // ========================================

    /**
     * Processa e valida valores extraídos da tabela ICF mantendo formato string
     * @param values Array de strings com os valores da tabela (6 valores: 3 pontos + 3 percentuais)
     * @returns Objeto Icf com os dados formatados
     */
    private processIcfTableValues(values: string[]): Icf {
        console.log('🔄 Processando valores completos ICF:', values);

        if (values.length < 6) {
            throw new Error(`Dados ICF completos insuficientes. Esperado: 6 valores (3 pontos + 3 percentuais), Encontrado: ${values.length}`);
        }

        // Parsear valores como string preservando o valor original
        return {
            // Primeiros 3 valores são os pontos - mantendo como string
            NC_PONTOS: String(values[0] || ''),              // NC (pontos)
            ATE_10_SM_PONTOS: String(values[1] || ''),       // Até 10 SM (pontos)
            MAIS_DE_10_SM_PONTOS: String(values[2] || ''),   // Mais de 10 SM (pontos)
            // Próximos 3 valores são os percentuais - mantendo como string
            NC_PERCENTUAL: String(values[3] || ''),          // NC (percentual)
            ATE_10_SM_PERCENTUAL: String(values[4] || ''),   // Até 10 SM (percentual)
            MAIS_DE_10_SM_PERCENTUAL: String(values[5] || ''), // Mais de 10 SM (percentual)
            MES: 0, // Será definido posteriormente
            ANO: 0, // Será definido posteriormente
            REGIAO: 'BR' as any, // Será definido posteriormente
            METODO: Metodo.PLA
        };
    }

    /**
     * Realiza autenticação no site ICF utilizando credenciais do ambiente
     * @param page Instância da página do Playwright
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
     * Extrai dados ICF do site via web scraping para um período específico
     * @param page Instância da página do Playwright
     * @param mes Mês do período desejado (1-12)
     * @param ano Ano do período desejado
     * @param regiao Região dos dados (ex: 'BR', 'SP')
     * @returns Objeto Icf com dados extraídos via web scraping
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
     * Extrai e processa dados específicos da tabela ICF no site
     * @param page Instância da página do Playwright
     * @param mes Mês do período para localização na tabela
     * @param ano Ano do período para localização na tabela
     * @returns Dados processados da tabela ICF
     */
    private async extractCompleteTableData(page: any, mes: number, ano: number): Promise<Icf> {
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
                            return this.processIcfTableValues(altValues.slice(1)); // Pular a primeira coluna (período)
                        } else {
                            throw new Error(`Dados insuficientes na tabela ICF. Esperado: 7 valores (período + 6 dados), Encontrado: ${altValues.length}`);
                        }
                    }

                    return this.processIcfTableValues(values.slice(1)); // Pular a primeira coluna (período)
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
                    console.log(LogMessages.webScrapingInicio('ICF', error.regiao, error.mes, error.ano));

                    const data = await this.extractDataFromWebsite(page, error.mes, error.ano, error.regiao);
                    const savedId = await this.saveIndividualIcfToDatabase(data);

                    console.log(LogMessages.webScrapingSucesso('ICF', error.regiao, error.mes, error.ano));
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
                    console.log(LogMessages.webScrapingFalha('ICF', error.regiao, error.mes, error.ano, scrapingError));

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

            console.log(`\n=== Resultado do Web Scraping ICF ===`);
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
     * Método principal que executa o processamento completo dos dados ICF
     * Inclui download, extração, salvamento, retry via web scraping e processamento de metadados
     * @param regioes Array de regiões para processamento (padrão: ['BR'])
     * @returns Objeto IServiceResult com estatísticas completas da execução
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
        let savedIds: string[] = [];
        // Array para catalogar períodos com erro de "Índice (Variação Mensal)" não encontrada
        const periodsWithMissingVariation: IErrorService[] = [];

        for (const period of periods) {
            for (const regiao of regioes) {
                try {
                    console.log(LogMessages.processando('ICF', regiao, period.mes, period.ano));

                    const currentUrl = this.buildUrl(period.mes, period.ano, regiao);
                    const currentFilePath = await this.downloadExcelFile(currentUrl, `${regiao}_${period.mes}${period.ano}`);

                    // Validar layout da planilha
                    const layoutValidation = await this.isExcelLayoutValid(currentFilePath);
                    const layoutStatus = layoutValidation.valid ? 'padrão' : 'inconsistente';
                    const inconsistenciaLayout = layoutValidation.inconsistencies;

                    const completeData = await this.extractCompleteDataFromExcel(currentFilePath);
                    completeData.data.MES = period.mes;
                    completeData.data.ANO = period.ano;
                    completeData.data.REGIAO = regiao as Regiao;
                    completeData.data.METODO = Metodo.PLA;

                    // Se não tem variação mensal, catalogar para cálculo posterior (não salvar ainda)
                    if (!completeData.hasVariation) {

                        console.log(`📊 Período ${regiao} ${period.mes.toString().padStart(2, '0')}/${period.ano} sem variação mensal - será calculada`);

                        periodsWithMissingVariation.push({
                            mes: period.mes,
                            ano: period.ano,
                            regiao: regiao
                        });

                        continue; // Não salvar agora, será calculado depois
                    }

                    // Salvar registro individual
                    const savedId = await this.saveIndividualIcfToDatabase(completeData.data);
                    savedIds.push(savedId);
                    registrosPlanilha++;

                    tasks.push({
                        mes: period.mes,
                        ano: period.ano,
                        regiao,
                        status: 'Sucesso',
                        servico: 'ICF',
                        metodo: Metodo.PLA,
                        layout: layoutStatus,
                        inconsistenciaLayout: inconsistenciaLayout
                    });

                    console.log(LogMessages.sucesso('ICF', regiao, period.mes, period.ano));

                } catch (error) {
                    console.log(`❌ Erro geral para ${regiao} ${period.mes}/${period.ano}: ${error}`);
                    erros.push({ regiao, mes: period.mes, ano: period.ano });
                    tasks.push({
                        mes: period.mes,
                        ano: period.ano,
                        regiao,
                        status: 'Falha',
                        servico: 'ICF',
                        metodo: Metodo.PLA,
                        erro: error.toString()
                    });
                }
            }
        }

        // Processar períodos com variação mensal ausente
        if (periodsWithMissingVariation.length > 0) {
            
            console.log(`\n🔧 Processando ${periodsWithMissingVariation.length} períodos com variação mensal ausente...`);

            const successfulCalculations = await this.calculateMissingVariations(periodsWithMissingVariation);

            // Atualizar tasks com base no resultado do cálculo
            for (const period of periodsWithMissingVariation) {
                const taskIndex = tasks.findIndex(t =>
                    t.mes === period.mes &&
                    t.ano === period.ano &&
                    t.regiao === period.regiao &&
                    t.erro?.includes('Variação mensal ausente')
                );

                if (taskIndex !== -1) {
                    // Verificar se este período foi calculado com sucesso
                    const wasCalculated = successfulCalculations.some(calc =>
                        calc.MES === period.mes &&
                        calc.ANO === period.ano &&
                        calc.REGIAO === period.regiao
                    );

                    if (wasCalculated) {
                        // Período calculado com sucesso
                        delete tasks[taskIndex].erro;
                        console.log(`✅ Task atualizada: ${period.regiao} ${period.mes.toString().padStart(2, '0')}/${period.ano} calculado com sucesso`);
                    } else {
                        // Período foi ignorado por falta de período anterior
                        tasks[taskIndex].status = 'Falha';
                        tasks[taskIndex].erro = 'Período anterior não encontrado para cálculo de variação mensal';
                        console.log(`❌ Task marcada como falha: ${period.regiao} ${period.mes.toString().padStart(2, '0')}/${period.ano} - período anterior não encontrado`);
                    }
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
            console.log('\n🔄 Iniciando processamento de metadados ICF...');
            await this.processMetadataForPlanilhaRecords(savedIds);
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

        // Limpeza da pasta temp ao final da execução
        await cleanupServiceTempFolder('icf', this.TEMP_DIR);

        return resultado;
    }
}
