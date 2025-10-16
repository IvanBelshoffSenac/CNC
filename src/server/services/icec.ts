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
    generateServicePeriodsWithIncremental,
    generateServicePeriodsWithGapDetection,
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

    /**
     * Valida se o layout da planilha ICEC está conforme padrões estruturais conhecidos
     * Usa análise de metadados extraídos para identificar inconsistências de layout
     * @param filePath Caminho da planilha atual a ser validada
     * @returns Objeto com resultado da validação e detalhes das inconsistências
     */
    private async isExcelLayoutValid(filePath: string): Promise<{valid: boolean, inconsistencies?: string}> {
        try {
            console.log('🔍 Validando layout ICEC baseado em padrões estruturais...');

            const metadados = await this.extractMetadataFromExcel(filePath);
            const inconsistencias: string[] = [];
            
            // PADRÃO 1: Total de metadados deve ser 62
            if (metadados.length !== 62) {
                const erro = `P1: Esperado 62 metadados, encontrado ${metadados.length}`;
                console.log(`❌ Padrão 1 falhou: ${erro}`);
                inconsistencias.push(erro);
            } else {
                console.log('✅ Padrão 1: Total de metadados correto (62)');
            }

            // PADRÃO 2: Deve ter pelo menos 3 tipos de pesquisa únicos (flexível para layouts antigos)
            const tiposPesquisa = new Set(metadados.map(m => m.TIPOPESQUISA).filter(t => t));
            const tiposDetectados = Array.from(tiposPesquisa);
            const tiposEsperados = ['ICAEC', 'IEEC', 'IIEC', 'ICEC'];
            
            // Para layouts antigos, aceitar pelo menos 3 tipos ou ter pelo menos os básicos
            const temTiposBasicos = tiposDetectados.some(t => ['ICAEC', 'IEEC', 'IIEC'].includes(t));
            
            if (tiposPesquisa.size < 3 && !temTiposBasicos) {
                const erro = `P2: Esperado pelo menos 3 tipos de pesquisa ou tipos básicos, encontrado [${tiposDetectados.join(', ')}]`;
                console.log(`❌ Padrão 2 falhou: ${erro}`);
                console.log(`🔍 Tipos esperados: [${tiposEsperados.join(', ')}]`);
                inconsistencias.push(erro);
            } else {
                console.log(`✅ Padrão 2: Tipos de pesquisa adequados (${tiposPesquisa.size} tipos: ${tiposDetectados.join(', ')})`);
            }

            // PADRÃO 3: Deve ter exatamente 4 índices "em Pontos" (um para cada tipo)
            const indicesEmPontos = metadados.filter(m => 
                m.CAMPO && (
                    m.CAMPO.includes('(em Pontos)') || 
                    m.CAMPO.includes('(Em Pontos)') ||
                    m.CAMPO === 'Índice (em Pontos)' ||
                    m.CAMPO === 'Índice (Em Pontos)'
                )
            );
            if (indicesEmPontos.length !== 4) {
                const erro = `P3: Esperado 4 índices em pontos, encontrado ${indicesEmPontos.length}`;
                console.log(`❌ Padrão 3 falhou: ${erro}`);
                console.log(`🔍 Campos encontrados com "Pontos": ${indicesEmPontos.map(m => `${m.TIPOINDICE} - ${m.CAMPO}`).join(', ')}`);
                inconsistencias.push(erro);
            } else {
                console.log('✅ Padrão 3: Índices em pontos corretos (4)');
            }

            // PADRÃO 4: Deve ter pelo menos 16 seções de variação mensal (4 tipos x 4 campos cada)
            // Layout antigo: pode ter "ICEC (Índice Mensal)" ao invés de "ICEC (Variação Mensal)"
            const variacaoMensal = metadados.filter(m => 
                m.TIPOINDICE && (
                    m.TIPOINDICE.includes('(Variação Mensal)') ||
                    m.TIPOINDICE.includes('(Índice Mensal)') // Formato histórico 2012
                )
            );
            if (variacaoMensal.length < 12) { // Ajustado para 12 mínimo (formato 2012)
                const erro = `P4: Esperado >=12 seções de variação mensal, encontrado ${variacaoMensal.length}`;
                console.log(`❌ Padrão 4 falhou: ${erro}`);
                console.log(`🔍 Seções encontradas: ${variacaoMensal.map(m => m.TIPOINDICE).join(', ')}`);
                inconsistencias.push(erro);
            } else {
                console.log(`✅ Padrão 4: Seções de variação mensal suficientes (${variacaoMensal.length})`);
            }

            // PADRÃO 5: Tipos de índices essenciais devem existir (incluindo variações históricas)
            const tiposEssenciais = [
                // Variações para "Condição Atual da Economia"
                'Condição Atual da Economia',
                'Condições Atuais da Economia', // Versão 2012 (plural)
                
                // Variações para "Condição do Setor"  
                'Condição Atual do Setor',
                'Condição ãtual do Setor', // Note o acento diferente no ã
                'Condições Atuais do Setor', // Versão 2012 (plural)
                
                // Variações para "Condição da Empresa"
                'Condição Atual da Empresa',
                'Condições Atuais da Empresa', // Versão 2012 (plural)
                
                // Variações para "Expectativa para Economia"
                'Expectativa para Economia',
                'Expectativa para a Economia', // Versão 2012 (com "a")
                'Expectativa para Economia Brasileira',
                
                // Demais seções essenciais
                'Expectativa para Setor',
                'Expectativa para Empresa',
                'Expectativa Contratação',
                'Nível de Investimento',
                'Situação Atual dos Estoques'
            ];
            
            // Tipos únicos encontrados nos metadados (sem variação mensal)
            const tiposUnicos = new Set(metadados
                .map(m => m.TIPOINDICE)
                .filter(t => t && !t.includes('(Variação Mensal)'))
            );
            
            // Verificar quantos tipos essenciais foram encontrados
            let gruposEncontrados = 0;
            const tiposFaltando: string[] = [];
            
            const gruposEssenciais = [
                ['Condição Atual da Economia', 'Condições Atuais da Economia'],
                ['Condição Atual do Setor', 'Condição ãtual do Setor', 'Condições Atuais do Setor'],
                ['Condição Atual da Empresa', 'Condições Atuais da Empresa'],
                ['Expectativa para Economia', 'Expectativa para a Economia', 'Expectativa para Economia Brasileira'],
                ['Expectativa para Setor'],
                ['Expectativa para Empresa'],
                ['Expectativa Contratação'],
                ['Nível de Investimento'],
                ['Situação Atual dos Estoques']
            ];
            
            for (const grupo of gruposEssenciais) {
                const encontrado = grupo.some(variacao => 
                    Array.from(tiposUnicos).some(tipo => tipo.includes(variacao))
                );
                
                if (encontrado) {
                    gruposEncontrados++;
                } else {
                    tiposFaltando.push(grupo[0]); // Usar a primeira variação como referência
                }
            }
            
            if (gruposEncontrados < 6) {
                const erro = `P5: Esperado >=6 tipos essenciais, encontrado ${gruposEncontrados}. Faltando: ${tiposFaltando.join(', ')}`;
                console.log(`❌ Padrão 5 falhou: ${erro}`);
                console.log(`🔍 Tipos únicos encontrados: ${Array.from(tiposUnicos).join(', ')}`);
                inconsistencias.push(erro);
            } else {
                console.log(`✅ Padrão 5: Tipos de índices essenciais presentes (${gruposEncontrados}/9 grupos)`);
            }

            // PADRÃO 6: Deve ter dados numéricos válidos nos índices finais
            const indicesFinais = metadados.filter(m => 
                m.CAMPO === 'Índice (em Pontos)' || m.CAMPO === 'Índice'
            );
            
            let indicesComDados = 0;
            for (const indice of indicesFinais) {
                const total = parseFloat(indice.TOTAL);
                if (!isNaN(total) && total > 10 && total < 300) { // Ajustado range baseado nos dados reais
                    indicesComDados++;
                }
            }
            
            if (indicesComDados < 4) {
                const erro = `P6: Esperado >=4 índices com dados válidos, encontrado ${indicesComDados}`;
                console.log(`❌ Padrão 6 falhou: ${erro}`);
                console.log(`🔍 Índices encontrados: ${indicesFinais.map(i => `${i.TIPOINDICE} - ${i.CAMPO}: ${i.TOTAL}`).join(', ')}`);
                inconsistencias.push(erro);
            } else {
                console.log(`✅ Padrão 6: Índices com dados numéricos válidos (${indicesComDados})`);
            }

            // PADRÃO 7: Estrutura de campos por tipo de índice
            const camposEsperados = ['Melhoram muito', 'Melhoram', 'Melhorar muito', 'Melhorar', 'Pioram', 'Piorar', 'Índice', 'Adequada', 'Acima', 'Abaixo'];
            const tiposComEstrutura = metadados.reduce((acc, m) => {
                if (!acc[m.TIPOINDICE]) acc[m.TIPOINDICE] = new Set();
                acc[m.TIPOINDICE].add(m.CAMPO);
                return acc;
            }, {} as Record<string, Set<string>>);

            let tiposComEstruturaCorreta = 0;
            Object.entries(tiposComEstrutura).forEach(([tipo, campos]) => {
                if (tipo && !tipo.includes('(Variação Mensal)')) {
                    const temEstruturaPadrao = Array.from(campos).some(campo => 
                        camposEsperados.some(esperado => 
                            campo.toLowerCase().includes(esperado.toLowerCase())
                        )
                    );
                    if (temEstruturaPadrao) tiposComEstruturaCorreta++;
                }
            });

            if (tiposComEstruturaCorreta < 6) {
                const erro = `P7: Esperado >=6 tipos com estrutura padrão, encontrado ${tiposComEstruturaCorreta}`;
                console.log(`❌ Padrão 7 falhou: ${erro}`);
                console.log(`🔍 Tipos sem variação mensal: ${Object.keys(tiposComEstrutura).filter(t => t && !t.includes('(Variação Mensal)')).join(', ')}`);
                inconsistencias.push(erro);
            } else {
                console.log(`✅ Padrão 7: Estrutura de campos adequada (${tiposComEstruturaCorreta} tipos)`);
            }

            if (inconsistencias.length === 0) {
                console.log('✅ Todos os padrões estruturais validados com sucesso!');
                return { valid: true };
            } else {
                return { valid: false, inconsistencies: inconsistencias.join(' | ') };
            }
            
        } catch (error) {
            console.log(`❌ Erro ao validar layout da planilha ICEC: ${error}`);
            // Em caso de erro, assumir layout inconsistente para investigação
            return { valid: false, inconsistencies: `Erro na validação: ${error}` };
        }
    }    // ========================================
    // SEÇÃO 3: MÉTODOS DE METADADOS
    // ========================================

    /**
     * Versão adaptada do transformJsonToICEC que lida com múltiplos layouts históricos
     * Suporta layouts de 2012 (plural) até 2025 (singular + layout quebrado)
     * - Layout 2012: "Condições Atuais da Economia" (plural)
     * - Layout atual: "Condição Atual da Economia" (singular) 
     * - Layout quebrado 2025: cabeçalhos com zeros
     */
    private transformJsonToICEC(jsonData: any[][]): any {
        const result: any[] = [];
        let currentTipo: any | null = null;
        let currentTipoPesquisa: string = '';

        // Função helper para verificar se é a primeira linha inválida (com nulls e "Porte")
        const isInvalidFirstLine = (row: any[]): boolean => {
            return row[0] === null && row[1] === null && row[2] === "Porte";
        };

        // Função para normalizar nomes de seções históricas
        const normalizeSectionName = (name: string): string => {
            if (!name || typeof name !== 'string') return name;
            
            // Normalizar variações históricas para formato padrão
            const normalizations: Record<string, string> = {
                // Condições Atuais -> Condição Atual (plural para singular)
                'Condições Atuais da Economia': 'Condição Atual da Economia',
                'Condições Atuais do Setor (Comércio)': 'Condição Atual do Setor (Comércio)',
                'Condições Atuais da Empresa': 'Condição Atual da Empresa',
                
                // Expectativas com "a" -> sem "a"
                'Expectativa para a Economia': 'Expectativa para Economia',
                'Expectativa para a Economia Brasileira': 'Expectativa para Economia Brasileira',
                
                // Variações com "ã" e "à"
                'Condição ãtual do Setor (Comércio)': 'Condição Atual do Setor (Comércio)',
                
                // Variações de contratação
                'Expectativa Contratação de Funcionários': 'Expectativa Contratação de Funcionário',
                'Expectativa Contratação de Funcionário': 'Expectativa Contratação de Funcionário',
                
                // Variações de seções de variação mensal (formato histórico 2012)
                'ICEC (Índice Mensal)': 'ICEC (Variação Mensal)'
            };
            
            // Aplicar normalização se existir
            return normalizations[name] || name;
        };

        // Função para extrair o tipo de pesquisa da coluna 7 do cabeçalho
        const extractTipoPesquisa = (row: any[]): string => {
            if (row[7] && typeof row[7] === 'string') {
                const text = row[7].toString();
                if (text.includes('ICAEC')) return 'ICAEC';
                if (text.includes('IEEC')) return 'IEEC';
                if (text.includes('IIEC')) return 'IIEC';
                if (text.includes('ICEC')) return 'ICEC';
            }
            return currentTipoPesquisa;
        };

        // Função para inferir tipo de pesquisa baseado no nome da seção (para layouts antigos sem identificadores)
        const inferTipoPesquisaFromSectionName = (sectionName: string): string => {
            if (!sectionName || typeof sectionName !== 'string') return '';
            
            const normalized = sectionName.toLowerCase().trim();
            
            // Mapeamento baseado nos padrões históricos identificados (2016 e anteriores)
            const mappings = {
                // ICAEC - Índice de Condições Atuais da Economia do Comércio
                'condição atual da economia': 'ICAEC',
                'condições atuais da economia': 'ICAEC',
                'condicoes atuais da economia': 'ICAEC', // sem acento, formato 2016
                'condição atual do setor': 'ICAEC',
                'condições atuais do setor': 'ICAEC',
                'condicoes atuais do setor': 'ICAEC',
                
                // IEEC - Índice de Expectativas da Economia do Comércio  
                'condição atual da empresa': 'IEEC',
                'condições atuais da empresa': 'IEEC',
                'expectativa para economia brasileira': 'IEEC',
                'expectativa para economia': 'IEEC',
                'expectativa para empresa': 'IEEC',
                
                // IIEC - Índice de Investimento Esperado do Comércio
                'expectativa para setor': 'IIEC',
                'expectativa para setor (comércio)': 'IIEC',
                'expectativas para contratação': 'IIEC',
                'expectativas para contratação de funcionários': 'IIEC',
                'expectativa contratação': 'IIEC',
                'nível de investimento': 'IIEC',
                'situação atual dos estoques': 'IIEC',
                
                // ICEC - Índice de Confiança do Empresário do Comércio (índice geral)
                'icec': 'ICEC',
                'icec (índice mensal)': 'ICEC',
                'icec (variação mensal)': 'ICEC',
                'índice': 'ICEC',
                'índice (variação mensal)': 'ICEC',
                'índice (em pontos)': 'ICEC'
            };
            
            // Busca correspondência exata primeiro
            if (mappings[normalized]) {
                return mappings[normalized];
            }
            
            // Busca por correspondência parcial para casos com variações de formato
            for (const [pattern, type] of Object.entries(mappings)) {
                if (normalized.includes(pattern)) {
                    return type;
                }
            }
            
            // Fallback: busca por códigos diretos no nome
            if (normalized.includes('icaec')) return 'ICAEC';
            if (normalized.includes('ieec')) return 'IEEC';
            if (normalized.includes('iiec')) return 'IIEC';
            if (normalized.includes('icec')) return 'ICEC';
            
            return '';
        };

        // Função para identificar cabeçalhos de variação mensal com layout quebrado
        const isVariacaoMensalQuebraHeader = (row: any[]): boolean => {
            // Novo formato: linha tem nome da categoria e depois zeros
            const nomeCategoria = row[0];
            if (!nomeCategoria || typeof nomeCategoria !== 'string') return false;

            // Verificar se é uma das categorias de variação mensal conhecidas
            const isVariacaoMensal = nomeCategoria.includes('(Variação Mensal)');

            // Verificar se as próximas colunas são zeros
            const hasZeros = row[1] === 0 && row[2] === 0 && row[3] === 0;

            return isVariacaoMensal && hasZeros;
        };

        for (let i = 0; i < jsonData.length; i++) {
            const row = jsonData[i];

            // Ignorar linha inválida do início
            if (isInvalidFirstLine(row)) {
                continue;
            }

            // Verifica se é uma linha de cabeçalho (nova categoria)
            // Tipo 1: Categorias normais com "total - em %"
            // Tipo 2: Categorias de variação mensal com "Total" (formato antigo)
            // Tipo 3: Categorias de variação mensal com zeros (formato novo/quebrado)
            const isNormalHeader = row[1] === "total - em %" && row[2] === "Empresas com até 50 empregados" && row[3] === "Empresas com mais de 50 empregados";
            const isVariacaoMensalHeader = row[1] === "Total" && row[2] === "Empresas com até 50 empregados" && row[3] === "Empresas com mais de 50 empregados";
            const isVariacaoMensalQuebraHeaderDetected = isVariacaoMensalQuebraHeader(row);

            if (isNormalHeader || isVariacaoMensalHeader || isVariacaoMensalQuebraHeaderDetected) {
                // Se já existe um tipo atual, adiciona ao resultado
                if (currentTipo) {
                    result.push(currentTipo);
                }

                // Extrai o tipo de pesquisa do cabeçalho (método principal)
                let tipoPesquisa = extractTipoPesquisa(row);
                
                // Se não encontrou pela coluna 7, tenta inferir pelo nome da seção (layouts antigos)
                if (!tipoPesquisa) {
                    tipoPesquisa = inferTipoPesquisaFromSectionName(row[0]);
                }
                
                // Atualiza o tipo de pesquisa atual
                if (tipoPesquisa) {
                    currentTipoPesquisa = tipoPesquisa;
                }

                // Cria novo tipo com normalização histórica
                currentTipo = {
                    tipo: normalizeSectionName(row[0]),
                    valores: []
                };
            } else if (currentTipo && row[0] && row[1] !== undefined) {

                // Verifica se é um índice verdadeiro
                const isIndice = (row[0] === "Índice" || row[0] === "Índice (em Pontos)");

                // Adiciona o valor (seja índice ou não) com o tipo de pesquisa atual
                currentTipo.valores.push({
                    tipo: row[0],
                    indice: isIndice,
                    total: row[1] || '',
                    "Empresas com até 50 empregados": row[2] || '',
                    "Empresas com mais de 50 empregados": row[3] || '',
                    semiduraveis: row[4] || '',
                    nao_duraveis: row[5] || '',
                    duraveis: row[6] || '',
                    tipopesquisa: currentTipoPesquisa
                });
            }
        }

        // Adiciona o último tipo se existir
        if (currentTipo) {
            result.push(currentTipo);
        }

        return {
            icectableTipo: result
        };
    }

    /**
     * Extrai metadados completos de uma planilha ICEC utilizando função otimizada e adaptada
     * Processa todos os tipos de índices e seus respectivos valores
     * Compatível com ambos os layouts: antigo (até mês 8) e novo (a partir do mês 9)
     * @param filePath Caminho completo da planilha Excel
     * @returns Array de objetos MetadadosIcec com todos os dados estruturados
     */
    private async extractMetadataFromExcel(filePath: string): Promise<MetadadosIcec[]> {
        try {
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null }) as any[][];

            // Usar a função adaptada para extrair dados estruturados (compatível com layout quebrado)
            const icecCompleta = this.transformJsonToICEC(jsonData);

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

            console.log(`📊 Metadados extraídos: ${metadados.length} registros processados`);
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
     * Obtém o último período (ANO e MÊS) registrado no banco de dados para ICEC
     * Usado no modo incremental para determinar o ponto de início da coleta
     * @returns Objeto com mes e ano do último registro, ou null se não houver registros
     */
    private async getLastIcecPeriod(): Promise<IPeriod | null> {
        try {
            // Buscar o último registro usando query builder para ter mais controle
            const lastRecord = await icecRepository
                .createQueryBuilder('icec')
                .select(['icec.MES', 'icec.ANO'])
                .orderBy('icec.ANO', 'DESC')
                .addOrderBy('icec.MES', 'DESC')
                .limit(1)
                .getOne();

            if (!lastRecord) {
                console.log('ℹ️ Nenhum registro ICEC encontrado no banco de dados');
                return null;
            }

            console.log(`📅 Último período ICEC no banco: ${lastRecord.MES.toString().padStart(2, '0')}/${lastRecord.ANO}`);
            return {
                mes: lastRecord.MES,
                ano: lastRecord.ANO
            };

        } catch (error) {
            console.error('❌ Erro ao buscar último período ICEC:', error);
            return null;
        }
    }

    /**
     * Obtém todos os períodos únicos (ANO e MÊS) existentes no banco de dados para ICEC
     * Usado no modo incremental para detectar lacunas nos dados
     * @returns Array de períodos existentes no banco ou array vazio se não houver registros
     */
    private async getAllExistingIcecPeriods(): Promise<IPeriod[]> {
        try {
            const existingRecords = await icecRepository
                .createQueryBuilder('icec')
                .select(['icec.MES', 'icec.ANO'])
                .distinct(true)
                .orderBy('icec.ANO', 'ASC')
                .addOrderBy('icec.MES', 'ASC')
                .getMany();

            const periods: IPeriod[] = existingRecords.map(record => ({
                mes: record.MES,
                ano: record.ANO
            }));

            console.log(`📊 Total de períodos únicos no banco ICEC: ${periods.length}`);
            if (periods.length > 0) {
                const primeiro = periods[0];
                const ultimo = periods[periods.length - 1];
                console.log(`📅 Primeiro período: ${primeiro.mes.toString().padStart(2, '0')}/${primeiro.ano}`);
                console.log(`📅 Último período: ${ultimo.mes.toString().padStart(2, '0')}/${ultimo.ano}`);
            }

            return periods;

        } catch (error) {
            console.error('❌ Erro ao buscar períodos existentes ICEC:', error);
            return [];
        }
    }

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
     * Apenas executa limpeza quando PROCESSING_METHOD for 'Truncate and Load'
     * @returns String com log das operações realizadas
     */
    private async cleanDatabase(): Promise<string> {
        const processingMethod = process.env.PROCESSING_METHOD?.trim().replace(/'/g, '') || 'Incremental';
        
        if (processingMethod === 'Incremental') {
            const message = '🔄 Modo incremental ativo - mantendo dados existentes no banco';
            console.log(message);
            return `${message}\n`;
        }

        try {
            const logMessages: string[] = [];
            console.log('🧹 Modo Truncate and Load - limpando base de dados ICEC...');

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

        // Gerar períodos automaticamente baseado no método de processamento (com detecção de lacunas)
        const periods = await generateServicePeriodsWithGapDetection(
            'ICEC', 
            () => this.getLastIcecPeriod(),
            () => this.getAllExistingIcecPeriods()
        );

        // Verificar se há períodos para processar
        if (periods.length === 0) {
            console.log(`🔒 Nenhum período novo para processar - dados já atualizados`);
            
            const endTime = Date.now();
            const tempoExecucao = calculateExecutionTime(startTime, endTime);
            
            const resultado: IServiceResult = {
                servico: 'ICEC',
                periodoInicio: 'N/A',
                periodoFim: 'N/A',
                tempoExecucao,
                tasks: [],
                totalRegistros: 0,
                registrosPlanilha: 0,
                registrosWebScraping: 0,
                sucessos: 0,
                falhas: 0
            };

            console.log(`\n=== Processamento ICEC concluído ===`);
            console.log(`Status: Nenhum período novo para processar`);
            console.log(`Tempo: ${Math.round(tempoExecucao / 1000)} segundos`);

            return resultado;
        }

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

                    // Validar layout da planilha
                    const layoutValidation = await this.isExcelLayoutValid(currentFilePath);
                    const layoutStatus = layoutValidation.valid ? 'padrão' : 'inconsistente';
                    const inconsistenciaLayout = layoutValidation.inconsistencies;

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
                        metodo: Metodo.PLA,
                        layout: layoutStatus,
                        inconsistenciaLayout: inconsistenciaLayout
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