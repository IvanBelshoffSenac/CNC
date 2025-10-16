import axios from 'axios';
import * as XLSX from 'xlsx';
import * as fs from 'fs-extra';
import * as path from 'path';
import { chromium } from 'playwright';
import { icfRepository, metadadosIcfRepository } from '../database/repositories';
import { Icf, MetadadosIcf } from '../database/entities';
import { Regiao, Metodo, IErrorService, ITask, IServiceResult, IPeriod, idsIcf } from '../shared/interfaces';
import {
    generateServicePeriods,
    generateServicePeriodsWithGapDetection,
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
     * Converte valores numéricos para formato padronizado com casas decimais
     * Normaliza valores obtidos via web scraping para compatibilidade com MySQL DECIMAL(10,4)
     * @param value Valor a ser convertido (string, number ou null/undefined)
     * @returns String formatada com 4 casas decimais ou "0.0000" para valores inválidos
     */
    private converteCasasDecimais(value: any): string {
        // Tratar valores nulos ou indefinidos
        if (value === null || value === undefined || value === '') {
            return '0.0000';
        }

        try {
            // Converter para string e limpar
            let stringValue = String(value).trim();

            // Substituir vírgula por ponto (formato brasileiro para formato padrão)
            stringValue = stringValue.replace(',', '.');

            // Tentar converter para número
            const numericValue = parseFloat(stringValue);

            // Verificar se é um número válido
            if (isNaN(numericValue)) {
                console.log(`⚠️ Valor inválido detectado: "${value}" - usando 0.0000`);
                return '0.0000';
            }

            // Retornar com 4 casas decimais fixas (compatível com DECIMAL(10,4))
            return numericValue.toFixed(4);

        } catch (error) {
            console.log(`❌ Erro ao converter valor "${value}": ${error} - usando 0.0000`);
            return '0.0000';
        }
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

            // Converter para o formato MetadadosIcf
            const metadados: MetadadosIcf[] = [];

            for (const tipo of icfCompleta.icftableTipo) {
                for (const valor of tipo.valores) {
                    const metadado = new MetadadosIcf();
                    metadado.TIPOINDICE = tipo.tipo;
                    metadado.CAMPO = valor.tipo;

                    // Aplicar normalização nos valores para garantir compatibilidade com MySQL DECIMAL(10,4)
                    metadado.TOTAL = valor.total;
                    metadado.ATE_10_SM = valor["até 10sm - %"];
                    metadado.MAIS_DE_10_SM = valor["mais de 10sm - %"];
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
     * Extrai metadados de uma planilha com fallback para dados do banco
     */
    private async extractMetadataFromExcelWithFallback(
        caminhoArquivo: string, 
        periodo: { mes: number; ano: number; regiao: string },
        possuiVariacaoMensal: boolean = true
    ): Promise<MetadadosIcf[]> {
        try {
            // Tentar extrair metadados da planilha
            const metadados = await this.extractMetadataFromExcel(caminhoArquivo);
            
            // Se não possui variação mensal, completar com dados do banco
            if (!possuiVariacaoMensal) {
                console.log(`🔧 Completando metadados com dados do banco para período sem variação mensal: ${periodo.regiao} ${periodo.mes}/${periodo.ano}`);
                return await this.completarMetadadosComDadosDoBanco(metadados, periodo);
            }
            
            return metadados;
        } catch (error) {
            console.log(`⚠️ Erro ao extrair metadados da planilha: ${error.message}`);
            console.log(`📋 Arquivo de planilha não encontrado ou inválido para ${periodo.regiao} ${periodo.mes}/${periodo.ano}`);
            
            // Retornar array vazio como fallback
            console.log(`ℹ️ Retornando metadados vazios para ${periodo.regiao} ${periodo.mes}/${periodo.ano}`);
            return [];
        }
    }

    /**
     * Completa metadados com dados do banco para períodos sem variação mensal
     * Busca dados ICF no banco e adiciona campo "Índice (Variação Mensal)" com os percentuais
     */
    private async completarMetadadosComDadosDoBanco(
        metadados: MetadadosIcf[], 
        periodo: { mes: number; ano: number; regiao: string }
    ): Promise<MetadadosIcf[]> {
        try {
            // Buscar dados ICF no banco para este período/região
            const icfDoBanco = await icfRepository.findOne({
                where: {
                    MES: periodo.mes,
                    ANO: periodo.ano,
                    REGIAO: periodo.regiao as any
                }
            });

            if (!icfDoBanco) {
                console.log(`⚠️ Dados ICF não encontrados no banco para ${periodo.regiao} ${periodo.mes}/${periodo.ano}`);
                return metadados;
            }

            console.log(`✅ Dados ICF encontrados no banco: NC_PERCENTUAL=${icfDoBanco.NC_PERCENTUAL}, ATE_10_SM_PERCENTUAL=${icfDoBanco.ATE_10_SM_PERCENTUAL}, MAIS_DE_10_SM_PERCENTUAL=${icfDoBanco.MAIS_DE_10_SM_PERCENTUAL}`);

            // Verificar se existe seção "ICF (em pontos)" nos metadados (nova estrutura corrigida)
            const icfPontosExiste = metadados.some(m => m.TIPOINDICE === 'ICF (em pontos)');

            if (icfPontosExiste) {
                console.log(`ℹ️ Seção "ICF (em pontos)" existe, adicionando campo "Índice (Variação Mensal)"...`);
                
                // Verificar se já existe o campo "Índice (Variação Mensal)" na seção "ICF (em pontos)"
                const indiceVariacaoExiste = metadados.find(m => 
                    m.TIPOINDICE === 'ICF (em pontos)' && 
                    m.CAMPO === 'Índice (Variação Mensal)'
                );

                if (!indiceVariacaoExiste) {
                    console.log(`🆕 Adicionando campo "Índice (Variação Mensal)" na seção "ICF (em pontos)" com dados do banco...`);
                    
                    // Criar novo metadado com os percentuais do banco
                    const novoMetadado = new MetadadosIcf();
                    novoMetadado.TIPOINDICE = 'ICF (em pontos)';
                    novoMetadado.CAMPO = 'Índice (Variação Mensal)';
                    novoMetadado.TOTAL = icfDoBanco.NC_PERCENTUAL;
                    novoMetadado.ATE_10_SM = icfDoBanco.ATE_10_SM_PERCENTUAL;
                    novoMetadado.MAIS_DE_10_SM = icfDoBanco.MAIS_DE_10_SM_PERCENTUAL;
                    novoMetadado.INDICE = true; // Marcar como índice
                    
                    metadados.push(novoMetadado);
                    
                    console.log(`✅ Campo "Índice (Variação Mensal)" adicionado à seção "ICF (em pontos)": TOTAL=${novoMetadado.TOTAL}, ATE_10_SM=${novoMetadado.ATE_10_SM}, MAIS_DE_10_SM=${novoMetadado.MAIS_DE_10_SM}`);
                } else {
                    console.log(`ℹ️ Campo "Índice (Variação Mensal)" já existe na seção "ICF (em pontos)"`);
                }
                
            } else {
                // Para compatibilidade com estrutura antiga, verificar seção "ICF (Variação Mensal)"
                const icfVariacaoExiste = metadados.some(m => m.TIPOINDICE === 'ICF (Variação Mensal)');

                if (icfVariacaoExiste) {
                    console.log(`ℹ️ Seção "ICF (Variação Mensal)" existe (estrutura antiga), completando campos...`);
                    
                    // Procurar pelo campo "ICF (em pontos)" que pode estar com valores zerados
                    const icfEmPontosMeta = metadados.find(m => 
                        m.TIPOINDICE === 'ICF (Variação Mensal)' && 
                        (m.CAMPO === 'ICF (em pontos)' || m.CAMPO === 'Índice (Em Pontos)')
                    );

                    if (icfEmPontosMeta) {
                        console.log(`🔧 Corrigindo valores do campo "${icfEmPontosMeta.CAMPO}" com dados do banco...`);
                        
                        // Usar os valores de PONTOS ao invés de PERCENTUAL para "ICF (em pontos)"
                        icfEmPontosMeta.TOTAL = icfDoBanco.NC_PONTOS;
                        icfEmPontosMeta.ATE_10_SM = icfDoBanco.ATE_10_SM_PONTOS;
                        icfEmPontosMeta.MAIS_DE_10_SM = icfDoBanco.MAIS_DE_10_SM_PONTOS;
                        icfEmPontosMeta.INDICE = true; // Marcar como índice
                        
                        console.log(`✅ Valores corrigidos: TOTAL=${icfEmPontosMeta.TOTAL}, ATE_10_SM=${icfEmPontosMeta.ATE_10_SM}, MAIS_DE_10_SM=${icfEmPontosMeta.MAIS_DE_10_SM}`);
                    }

                    // Procurar se existe campo "Índice (Variação Mensal)" para adicionar percentuais
                    const indiceVariacaoMeta = metadados.find(m => 
                        m.TIPOINDICE === 'ICF (Variação Mensal)' && 
                        m.CAMPO === 'Índice (Variação Mensal)'
                    );

                    if (!indiceVariacaoMeta) {
                        console.log(`🆕 Adicionando campo "Índice (Variação Mensal)" com dados do banco...`);
                        
                        // Criar novo metadado com os percentuais do banco
                        const novoMetadado = new MetadadosIcf();
                        novoMetadado.TIPOINDICE = 'ICF (Variação Mensal)';
                        novoMetadado.CAMPO = 'Índice (Variação Mensal)';
                        novoMetadado.TOTAL = icfDoBanco.NC_PERCENTUAL;
                        novoMetadado.ATE_10_SM = icfDoBanco.ATE_10_SM_PERCENTUAL;
                        novoMetadado.MAIS_DE_10_SM = icfDoBanco.MAIS_DE_10_SM_PERCENTUAL;
                        novoMetadado.INDICE = true; // Marcar como índice
                        
                        metadados.push(novoMetadado);
                        
                        console.log(`✅ Campo adicionado: TOTAL=${novoMetadado.TOTAL}, ATE_10_SM=${novoMetadado.ATE_10_SM}, MAIS_DE_10_SM=${novoMetadado.MAIS_DE_10_SM}`);
                    }
                } else {
                    console.log(`ℹ️ Nenhuma seção ICF encontrada para completar metadados`);
                }
            }

            return metadados;

        } catch (error) {
            console.log(`❌ Erro ao completar metadados com dados do banco: ${error.message}`);
            return metadados; // Retornar metadados originais em caso de erro
        }
    }

    /**
     * Processa extração de metadados para todos os registros ICF obtidos via planilha
     * Localiza arquivos já baixados e extrai metadados detalhados com tratamento diferenciado
     * para períodos com e sem variação mensal
     * @param registros Array com objetos contendo ID e informação sobre variação mensal dos registros ICF
     */
    private async processMetadataForPlanilhaRecords(registros: idsIcf[]): Promise<void> {
        try {
            if (registros.length === 0) {
                console.log('ℹ️ Nenhum registro ICF fornecido para processamento de metadados');
                return;
            }

            const idsIcf = registros.map(r => r.id);

            // 1. Filtrar todos os registros de ICF do método 'Planilha'
            const registrosPlanilha = await icfRepository.find({
                where: { id: In(idsIcf) },
                order: { ANO: 'ASC', MES: 'ASC' }
            });

            const registrosMetadados = await metadadosIcfRepository.find({
                relations: {
                    icf: true
                }
            });

            if (registrosPlanilha.length === 0) {
                console.log('ℹ️ Nenhum registro ICF do tipo Planilha encontrado');
                return;
            }

            console.log(`📊 Encontrados ${registrosPlanilha.length} registros ICF do tipo Planilha`);

            interface IPeriodRegionWithVariation extends IPeriod {
                regiao: Regiao;
                possuiVariacaoMensal: boolean;
            }

            // 2. Mapear os registros para extrair períodos únicos por região com informação de variação
            const periodosMap = new Map<string, IPeriodRegionWithVariation>();

            for (const registro of registrosPlanilha) {
                const chaveperiodo = `${registro.MES}-${registro.ANO}-${registro.REGIAO}`;
                if (!periodosMap.has(chaveperiodo)) {
                    // Buscar informação sobre variação mensal do registro correspondente
                    const registroInfo = registros.find(r => r.id === registro.id);
                    const possuiVariacaoMensal = registroInfo?.possuiVariacaoMensal ?? true;

                    periodosMap.set(chaveperiodo, {
                        mes: registro.MES,
                        ano: registro.ANO,
                        regiao: registro.REGIAO,
                        possuiVariacaoMensal
                    });
                }
            }

            const periodos: IPeriodRegionWithVariation[] = Array.from(periodosMap.values());
            console.log(`📅 Períodos únicos identificados: ${periodos.length}`);

            // 3. Para cada período/região, processar metadados com tratamento diferenciado
            for (const periodo of periodos) {
                try {
                    console.log(`📥 Processando metadados para período ${periodo.regiao} ${periodo.mes.toString().padStart(2, '0')}/${periodo.ano}...`);

                    // Localizar arquivo já baixado na pasta temporária
                    const filePath = await this.findExistingExcelFile(periodo.regiao, periodo.mes, periodo.ano);

                    if (!filePath) {
                        console.log(`⚠️ Arquivo não encontrado para ${periodo.regiao} ${periodo.mes.toString().padStart(2, '0')}/${periodo.ano} - pulando processamento de metadados`);
                        continue;
                    }

                    // Buscar todos os registros ICF que correspondem a este período/região
                    const registrosParaPeriodo = registrosPlanilha.filter((r) =>
                        r.MES === periodo.mes && r.ANO === periodo.ano && r.REGIAO === periodo.regiao
                    );

                    // Verificar se já existem metadados para este período
                    const metadatosExistentes = registrosMetadados.filter((m) =>
                        m.icf && registrosParaPeriodo.some((r) => r.id === m.icf.id)
                    );

                    if (metadatosExistentes.length > 0) {
                        console.log(`ℹ️ Metadados já existem para período ${periodo.regiao} ${periodo.mes.toString().padStart(2, '0')}/${periodo.ano}`);
                        continue;
                    }

                    // Extrair metadados baseado na disponibilidade de variação mensal
                    let metadados: MetadadosIcf[];

                    if (periodo.possuiVariacaoMensal) {
                        // Período com variação mensal: usar extração padrão
                        console.log(`✅ Período com variação mensal - usando extração padrão`);
                        metadados = await this.extractMetadataFromExcel(filePath);
                    } else {
                        // Período sem variação mensal: usar extração com fallback
                        console.log(`⚠️ Período sem variação mensal - usando extração com fallback`);
                        metadados = await this.extractMetadataFromExcelWithFallback(
                            filePath, 
                            {
                                mes: periodo.mes,
                                ano: periodo.ano,
                                regiao: periodo.regiao
                            },
                            periodo.possuiVariacaoMensal
                        );
                    }

                    if (metadados.length > 0) {
                        // Salvar metadados individualmente para cada registro ICF do período
                        for (const registro of registrosParaPeriodo) {
                            await this.saveIndividualMetadataToDatabase(metadados, registro);
                        }
                        console.log(`✅ Metadados processados e salvos para ${registrosParaPeriodo.length} registros ICF`);
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
     * Busca o último período processado no banco de dados ICF
     * Usado para determinar ponto de partida no modo incremental
     * @returns IPeriod com o último mês/ano processado ou null se não houver dados
     */
    private async getLastIcfPeriod(): Promise<IPeriod | null> {
        try {
            const lastRecord = await icfRepository
                .createQueryBuilder('icf')
                .select(['icf.MES', 'icf.ANO'])
                .orderBy('icf.ANO', 'DESC')
                .addOrderBy('icf.MES', 'DESC')
                .limit(1)
                .getOne();

            if (!lastRecord) {
                return null;
            }

            return {
                mes: lastRecord.MES,
                ano: lastRecord.ANO
            };
        } catch (error) {
            console.log(`❌ Erro ao buscar último período ICF: ${error}`);
            return null;
        }
    }

    /**
     * Busca todos os períodos existentes no banco de dados ICF
     * Usado para detecção de lacunas no modo incremental
     * @returns Array de IPeriod com todos os períodos únicos existentes
     */
    private async getAllExistingIcfPeriods(): Promise<IPeriod[]> {
        try {
            const existingPeriods = await icfRepository
                .createQueryBuilder('icf')
                .select(['icf.MES', 'icf.ANO'])
                .distinct(true)
                .orderBy('icf.ANO', 'ASC')
                .addOrderBy('icf.MES', 'ASC')
                .getMany();

            return existingPeriods.map(record => ({
                mes: record.MES,
                ano: record.ANO
            }));
        } catch (error) {
            console.log(`❌ Erro ao buscar períodos existentes ICF: ${error}`);
            return [];
        }
    }

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
     * Considera o método de processamento configurado (Incremental vs Truncate and Load)
     * @returns String com log das operações realizadas
     */
    private async cleanDatabase(): Promise<string> {
        try {
            const logMessages: string[] = [];
            const processingMethod = process.env.PROCESSING_METHOD || 'Truncate and Load';

            console.log(`📋 Método de processamento configurado: ${processingMethod}`);

            if (processingMethod === 'Incremental') {
                console.log('🔄 Modo incremental ativo - mantendo dados existentes no banco');
                logMessages.push('🔄 Modo incremental ativo - mantendo dados existentes no banco');
                return logMessages.join('\n') + '\n';
            }

            // Modo Truncate and Load - limpar tudo
            console.log('🗑️ Modo Truncate and Load ativo - limpando todos os dados do banco');

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

        // Normalizar valores para formato decimal padronizado (compatível com MySQL DECIMAL(10,4))
        const normalizedValues = values.map(val => val);

        console.log('📊 Valores normalizados:', normalizedValues);

        return {
            // Primeiros 3 valores são os pontos - normalizados para DECIMAL(10,4)
            NC_PONTOS: normalizedValues[0],              // NC (pontos)
            ATE_10_SM_PONTOS: normalizedValues[1],       // Até 10 SM (pontos)
            MAIS_DE_10_SM_PONTOS: normalizedValues[2],   // Mais de 10 SM (pontos)
            // Próximos 3 valores são os percentuais - normalizados para DECIMAL(10,4)
            NC_PERCENTUAL: normalizedValues[3],          // NC (percentual)
            ATE_10_SM_PERCENTUAL: normalizedValues[4],   // Até 10 SM (percentual)
            MAIS_DE_10_SM_PERCENTUAL: normalizedValues[5], // Mais de 10 SM (percentual)
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
     * Suporte para modo incremental com detecção de lacunas
     * @param regioes Array de regiões para processamento (padrão: ['BR'])
     * @returns Objeto IServiceResult com estatísticas completas da execução
     */
    public async processAllIcfDataWithMonitoring(regioes: string[] = ['BR']): Promise<IServiceResult> {
        const startTime = Date.now();
        console.log('🚀 Iniciando processamento completo dos dados ICF com monitoramento...\n');

        const resultadoLimpeza = await this.cleanDatabase();
        console.log(resultadoLimpeza);

        console.log(`📍 Regiões a processar: ${regioes.join(', ')}\n`);

        // Determinar períodos baseado no método de processamento
        const processingMethod = process.env.PROCESSING_METHOD || 'Truncate and Load';
        let periods: IPeriod[];

        if (processingMethod === 'Incremental') {
            console.log('🔍 Modo incremental: detectando lacunas nos dados...');
            const existingPeriods = await this.getAllExistingIcfPeriods();
            console.log(`📊 Total de períodos únicos no banco ICF: ${existingPeriods.length}`);
            
            if (existingPeriods.length > 0) {
                console.log(`📅 Primeiro período: ${existingPeriods[0].mes.toString().padStart(2, '0')}/${existingPeriods[0].ano}`);
                console.log(`📅 Último período: ${existingPeriods[existingPeriods.length - 1].mes.toString().padStart(2, '0')}/${existingPeriods[existingPeriods.length - 1].ano}`);
            }
            
            periods = await generateServicePeriodsWithGapDetection(
                'ICF', 
                this.getLastIcfPeriod.bind(this), 
                this.getAllExistingIcfPeriods.bind(this)
            );
        } else {
            periods = generateServicePeriods('ICF');
        }
        const tasks: ITask[] = [];
        let registrosPlanilha = 0;
        let registrosWebScraping = 0;
        let erros: IErrorService[] = [];
        let savedIds: idsIcf[] = [];
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
                    savedIds.push({ id: savedId, possuiVariacaoMensal: true });
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

        // Processar períodos com variação mensal ausente via web scraping
        if (periodsWithMissingVariation.length > 0) {

            console.log(`\n🔧 Processando ${periodsWithMissingVariation.length} períodos com variação mensal ausente via web scraping...`);

            const browser = await chromium.launch({ headless: true });
            let sucessosWebScrapingVariacao = 0;

            try {
                const page = await browser.newPage();

                // Fazer login
                await this.performLogin(page);

                for (const period of periodsWithMissingVariation) {
                    try {
                        console.log(`🌐 Buscando dados via web scraping para ${period.regiao} ${period.mes.toString().padStart(2, '0')}/${period.ano}...`);

                        const data = await this.extractDataFromWebsite(page, period.mes, period.ano, period.regiao);

                        data.METODO = Metodo.PLA; // Ajustar método para PLA, pois é para variação mensal da planilha
                        data.NC_PONTOS = this.converteCasasDecimais(data.NC_PONTOS);
                        data.ATE_10_SM_PONTOS = this.converteCasasDecimais(data.ATE_10_SM_PONTOS);
                        data.MAIS_DE_10_SM_PONTOS = this.converteCasasDecimais(data.MAIS_DE_10_SM_PONTOS);
                        data.NC_PERCENTUAL = this.converteCasasDecimais(data.NC_PERCENTUAL);
                        data.ATE_10_SM_PERCENTUAL = this.converteCasasDecimais(data.ATE_10_SM_PERCENTUAL);
                        data.MAIS_DE_10_SM_PERCENTUAL = this.converteCasasDecimais(data.MAIS_DE_10_SM_PERCENTUAL);

                        const savedId = await this.saveIndividualIcfToDatabase(data);
                        savedIds.push({ id: savedId, possuiVariacaoMensal: false });
                        registrosPlanilha++; // Incrementar contador de registros
                        sucessosWebScrapingVariacao++;

                        // Adicionar task de sucesso
                        tasks.push({
                            mes: period.mes,
                            ano: period.ano,
                            regiao: period.regiao,
                            status: 'Sucesso',
                            servico: 'ICF',
                            metodo: Metodo.PLA, // Web Scraping ao invés de Planilha
                            layout: 'padrão' // Layout assumido como padrão para web scraping
                        });

                        console.log(`✅ Dados obtidos via web scraping: ${period.regiao} ${period.mes.toString().padStart(2, '0')}/${period.ano}`);

                    } catch (scrapingError) {
                        console.log(`❌ Erro ao obter dados via web scraping para ${period.regiao} ${period.mes.toString().padStart(2, '0')}/${period.ano}: ${scrapingError}`);

                        // Adicionar aos erros para segunda tentativa
                        erros.push({
                            regiao: period.regiao,
                            mes: period.mes,
                            ano: period.ano
                        });

                        tasks.push({
                            mes: period.mes,
                            ano: period.ano,
                            regiao: period.regiao,
                            status: 'Falha',
                            servico: 'ICF',
                            metodo: Metodo.PLA,
                            erro: `Variação mensal ausente na planilha, falha no web scraping: ${scrapingError}`
                        });
                    }
                }

            } finally {
                await browser.close();
            }

            console.log(`✅ Web scraping para variações ausentes concluído: ${sucessosWebScrapingVariacao} sucessos de ${periodsWithMissingVariation.length} tentativas`);
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
