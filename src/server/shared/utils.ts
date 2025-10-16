import { format } from 'date-fns';
import * as fs from 'fs-extra';
import * as path from 'path';
import { icfXLSXCompleta, icfXLSXTipo, IPeriod, peicXLSXCompleta, peicXLSXTipo, icecXLSXCompleta, icecXLSXTipo } from './interfaces';
import { icecRepository } from '../database/repositories';

/**
 * Gera períodos de janeiro/2010 até o período atual
 * @param isPeic Se true, vai até o mês anterior (para PEIC)
 * @returns Array de períodos
 */
export function generatePeriods(isPeic: boolean = false): IPeriod[] {
    const periods: IPeriod[] = [];
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = isPeic ? currentDate.getMonth() : currentDate.getMonth() + 1;

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

/**
 * Formata período no padrão MM/yyyy
 * @param date Data a ser formatada (opcional, usa data atual se não fornecida)
 * @param subtractMonth Se deve subtrair um mês (usado para PEIC)
 * @returns String formatada no padrão MM/yyyy (ex: "08/2025")
 */
export function formatPeriod(date?: Date, subtractMonth: boolean = false): string {
    const currentDate = date || new Date();

    if (subtractMonth) {
        currentDate.setMonth(currentDate.getMonth() - 1);
    }

    return format(currentDate, 'MM/yyyy');
}

/**
 * Formata mês com zero à esquerda (01, 02, etc.)
 * @param mes Número do mês
 * @returns String com mês formatado
 */
export function formatMonth(mes: number): string {
    return mes.toString().padStart(2, '0');
}

/**
 * Formatar período para exibição nos logs
 * @param regiao Região (BR, ES)
 * @param mes Mês
 * @param ano Ano
 * @returns String formatada "REGIAO MM/YYYY"
 */
export function formatPeriodDisplay(regiao: string, mes: number, ano: number): string {
    return `${regiao} ${formatMonth(mes)}/${ano}`;
}

/**
 * Calcula tempo de execução em segundos
 * @param startTime Timestamp de início
 * @param endTime Timestamp de fim
 * @returns Tempo em segundos arredondado
 */
export function calculateExecutionTime(startTime: number, endTime: number): number {
    return Math.round((endTime - startTime) / 1000);
}

/**
 * Calcula estatísticas de sucesso e falha de tasks
 * @param tasks Array de tasks
 * @returns Objeto com sucessos e falhas
 */
export function calculateTaskStats(tasks: Array<{ status: 'Sucesso' | 'Falha' }>): { sucessos: number; falhas: number } {
    const sucessos = tasks.filter(t => t.status === 'Sucesso').length;
    const falhas = tasks.filter(t => t.status === 'Falha').length;
    return { sucessos, falhas };
}

/**
 * Remove arquivo temporário
 * @param filePath Caminho do arquivo
 */
export async function cleanupTempFile(filePath: string): Promise<void> {
    try {
        await fs.remove(filePath);
    } catch (error) {
        // Ignora erro de limpeza
    }
}

/**
 * Remove múltiplos arquivos temporários
 * @param filePaths Array de caminhos dos arquivos
 */
export async function cleanupTempFiles(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
        await cleanupTempFile(filePath);
    }
}

/**
 * Limpa toda a pasta temp de arquivos temporários do serviço
 * Esta função deve ser chamada ao final da execução de cada serviço
 * para melhorar o desempenho ao evitar limpezas individuais
 * @param serviceName Nome do serviço (icf, icec, peic)
 * @param tempDir Caminho da pasta temp
 */
export async function cleanupServiceTempFolder(serviceName: 'icf' | 'icec' | 'peic' | 'all', tempDir: string): Promise<void> {
    try {
        console.log(`🧹 Iniciando limpeza da pasta temp para ${serviceName.toUpperCase()}...`);

        if (!await fs.pathExists(tempDir)) {
            console.log(`📁 Pasta temp não existe: ${tempDir}`);
            return;
        }

        const files = await fs.readdir(tempDir);

        let serviceFiles: string[];

        if (serviceName === 'all') {
            // Para 'all', remover todos os arquivos .xls e .xlsx
            serviceFiles = files.filter(file =>
                file.endsWith('.xls') || file.endsWith('.xlsx')
            );
        } else {
            // Filtrar apenas arquivos do serviço específico
            const servicePattern = new RegExp(`^${serviceName.toLowerCase()}_`, 'i');
            serviceFiles = files.filter(file =>
                servicePattern.test(file) &&
                (file.endsWith('.xls') || file.endsWith('.xlsx'))
            );
        }

        if (serviceFiles.length === 0) {
            console.log(`📄 Nenhum arquivo temporário ${serviceName === 'all' ? 'encontrado' : `do ${serviceName.toUpperCase()} encontrado`}`);
            return;
        }

        console.log(`📄 Encontrados ${serviceFiles.length} arquivo(s) temporário(s) ${serviceName === 'all' ? 'na pasta temp' : `do ${serviceName.toUpperCase()}`}`);

        let removedCount = 0;
        for (const file of serviceFiles) {
            try {
                const filePath = path.join(tempDir, file);
                await fs.remove(filePath);
                removedCount++;
                console.log(`🗑️ Removido: ${file}`);
            } catch (error) {
                console.log(`⚠️ Erro ao remover ${file}: ${error}`);
            }
        }

        console.log(`✅ Limpeza concluída: ${removedCount}/${serviceFiles.length} arquivo(s) removido(s)`);

    } catch (error) {
        console.error(`❌ Erro durante limpeza da pasta temp para ${serviceName.toUpperCase()}:`, error);
    }
}

/**
 * Obtém período anterior para um mês/ano
 * @param mes Mês atual
 * @param ano Ano atual
 * @returns Período anterior
 */
export function getPreviousPeriod(mes: number, ano: number): IPeriod {
    if (mes === 1) {
        return { mes: 12, ano: ano - 1 };
    }
    return { mes: mes - 1, ano };
}

/**
 * Cria mensagens de log padronizadas
 */
export const LogMessages = {
    processando: (servico: string, regiao: string, mes: number, ano: number) =>
        `Processando período: ${formatPeriodDisplay(regiao, mes, ano)}`,

    sucesso: (servico: string, regiao: string, mes: number, ano: number) =>
        `✅ Período ${formatPeriodDisplay(regiao, mes, ano)} processado com sucesso`,

    erro: (servico: string, regiao: string, mes: number, ano: number, error: any) =>
        `✗ Erro no período ${formatPeriodDisplay(regiao, mes, ano)}: ${error}`,

    webScrapingInicio: (servico: string, regiao: string, mes: number, ano: number) =>
        `🌐 Tentando web scraping para ${servico} ${formatPeriodDisplay(regiao, mes, ano)}`,

    webScrapingSucesso: (servico: string, regiao: string, mes: number, ano: number) =>
        `✅ Web scraping bem-sucedido: ${servico} ${formatPeriodDisplay(regiao, mes, ano)}`,

    webScrapingFalha: (servico: string, regiao: string, mes: number, ano: number, error: any) =>
        `❌ Falha no web scraping: ${servico} ${formatPeriodDisplay(regiao, mes, ano)} - ${error}`,

    teste: (servico: string, regiao: string, mes: number, ano: number) =>
        `📊 Testando ${servico} ${formatPeriodDisplay(regiao, mes, ano)}`
};

/**
 * Interface para configuração de período parseada
 */
export interface IPeriodConfig {
    startDate: { mes: number; ano: number };
    endDate: { mes: number; ano: number };
}

/**
 * Valida e parseia configuração de período do .env
 * @param periodValue Valor do período do .env (ex: "01/2010:-1M")
 * @param defaultStart Data inicial padrão se não fornecida
 * @returns Configuração de período parseada
 */
export function parsePeriodConfig(
    periodValue?: string,
    defaultStart: string = '01/2010'
): IPeriodConfig {
    // Se não foi fornecido valor, usar padrão
    if (!periodValue) {
        const currentDate = new Date();
        const currentPeriod = formatPeriod(currentDate);
        return parsePeriodString(`${defaultStart}:${currentPeriod}`);
    }

    return parsePeriodString(periodValue);
}

/**
 * Parseia string de período no formato "MM/YYYY:ENDTYPE"
 * @param periodString String no formato "01/2010:-1M" ou "01/2010:>" ou "01/2010:08/2025"
 * @returns Configuração de período parseada
 */
function parsePeriodString(periodString: string): IPeriodConfig {
    const parts = periodString.split(':');

    if (parts.length !== 2) {
        throw new Error(`Formato de período inválido: ${periodString}. Use formato MM/YYYY:ENDTYPE`);
    }

    const [startStr, endStr] = parts;

    // Validar data inicial
    const startMatch = startStr.match(/^(\d{2})\/(\d{4})$/);
    if (!startMatch) {
        throw new Error(`Data inicial inválida: ${startStr}. Use formato MM/YYYY`);
    }

    const startMes = parseInt(startMatch[1], 10);
    const startAno = parseInt(startMatch[2], 10);

    if (startMes < 1 || startMes > 12) {
        throw new Error(`Mês inicial inválido: ${startMes}. Deve estar entre 01 e 12`);
    }

    if (startAno < 2000 || startAno > 2100) {
        throw new Error(`Ano inicial inválido: ${startAno}. Deve estar entre 2000 e 2100`);
    }

    // Processar data final
    const endDate = parseEndDate(endStr);

    return {
        startDate: { mes: startMes, ano: startAno },
        endDate
    };
}

/**
 * Parseia a parte final da configuração de período
 * @param endStr Parte final (">", "-1M", "08/2025")
 * @returns Data final parseada
 */
function parseEndDate(endStr: string): { mes: number; ano: number } {
    // Caso 1: ">" = data atual
    if (endStr === '>') {
        const currentDate = new Date();
        return {
            mes: currentDate.getMonth() + 1,
            ano: currentDate.getFullYear()
        };
    }

    // Caso 2: "-XM" = X meses antes da data atual
    const monthsBackMatch = endStr.match(/^-(\d+)M$/);
    if (monthsBackMatch) {
        const monthsBack = parseInt(monthsBackMatch[1], 10);
        const currentDate = new Date();
        currentDate.setMonth(currentDate.getMonth() - monthsBack);

        return {
            mes: currentDate.getMonth() + 1,
            ano: currentDate.getFullYear()
        };
    }

    // Caso 3: Data específica "MM/YYYY"
    const specificDateMatch = endStr.match(/^(\d{2})\/(\d{4})$/);
    if (specificDateMatch) {
        const endMes = parseInt(specificDateMatch[1], 10);
        const endAno = parseInt(specificDateMatch[2], 10);

        if (endMes < 1 || endMes > 12) {
            throw new Error(`Mês final inválido: ${endMes}. Deve estar entre 01 e 12`);
        }

        if (endAno < 2000 || endAno > 2100) {
            throw new Error(`Ano final inválido: ${endAno}. Deve estar entre 2000 e 2100`);
        }

        return { mes: endMes, ano: endAno };
    }

    throw new Error(`Formato de data final inválido: ${endStr}. Use ">", "-XM" ou "MM/YYYY"`);
}

/**
 * Gera períodos baseado na configuração do .env
 * @param periodConfig Configuração do período parseada
 * @returns Array de períodos
 */
export function generatePeriodsFromConfig(periodConfig: IPeriodConfig): IPeriod[] {
    const periods: IPeriod[] = [];
    const { startDate, endDate } = periodConfig;

    // Validar se data inicial não é posterior à final
    if (startDate.ano > endDate.ano ||
        (startDate.ano === endDate.ano && startDate.mes > endDate.mes)) {
        throw new Error(`Data inicial (${formatMonth(startDate.mes)}/${startDate.ano}) não pode ser posterior à data final (${formatMonth(endDate.mes)}/${endDate.ano})`);
    }

    // Gerar períodos
    for (let ano = startDate.ano; ano <= endDate.ano; ano++) {
        const startMonth = ano === startDate.ano ? startDate.mes : 1;
        const endMonth = ano === endDate.ano ? endDate.mes : 12;

        for (let mes = startMonth; mes <= endMonth; mes++) {
            periods.push({ mes, ano });
        }
    }

    return periods;
}

/**
 * Obtém configuração de período para um serviço específico
 * @param service Nome do serviço (ICF, ICEC, PEIC)
 * @returns Configuração de período do serviço
 */
export function getServicePeriodConfig(service: 'ICF' | 'ICEC' | 'PEIC'): IPeriodConfig {
    const envKey = `PERIOD_${service}`;
    const periodValue = process.env[envKey];

    try {
        return parsePeriodConfig(periodValue);
    } catch (error) {
        console.warn(`⚠️ Erro ao parsear ${envKey}: ${error}. Usando configuração padrão.`);
        // Fallback para configuração padrão
        return parsePeriodConfig();
    }
}

/**
 * Gera períodos para um serviço específico baseado na configuração do .env (versão síncrona - compatibilidade)
 * @param service Nome do serviço (ICF, ICEC, PEIC)
 * @returns Array de períodos para o serviço
 */
export function generateServicePeriods(service: 'ICF' | 'ICEC' | 'PEIC'): IPeriod[] {
    const processingMethod = process.env.PROCESSING_METHOD?.trim().replace(/'/g, '') || 'Incremental';
    
    // Para manter compatibilidade com ICF e PEIC, usar modo Truncate and Load como padrão
    if (processingMethod !== 'Incremental') {
        console.log('🧹 Modo Truncate and Load: processando período completo');
    } else {
        console.log('🔄 Modo incremental detectado, mas usando função de compatibilidade - processando período completo');
    }

    const config = getServicePeriodConfig(service);
    return generatePeriodsFromConfig(config);
}

/**
 * Gera períodos para um serviço específico com suporte completo ao modo incremental
 * Automaticamente detecta o modo de processamento e busca último registro quando necessário
 * @param service Nome do serviço (ICF, ICEC, PEIC)
 * @param getLastPeriodFn Função para buscar último período (apenas para modo incremental)
 * @returns Array de períodos para o serviço
 */
export async function generateServicePeriodsWithIncremental(
    service: 'ICF' | 'ICEC' | 'PEIC', 
    getLastPeriodFn?: () => Promise<IPeriod | null>
): Promise<IPeriod[]> {
    const processingMethod = process.env.PROCESSING_METHOD?.trim().replace(/'/g, '') || 'Incremental';
    
    console.log(`📋 Método de processamento configurado: ${processingMethod}`);

    const config = getServicePeriodConfig(service);

    // Modo Truncate and Load: processa período completo
    if (processingMethod === 'Truncate and Load') {
        console.log('🧹 Modo Truncate and Load: processando período completo');
        return generatePeriodsFromConfig(config);
    }

    // Modo Incremental: busca último período e processa a partir dele
    if (!getLastPeriodFn) {
        console.log('🔄 Modo incremental: função de busca não fornecida, processando período completo');
        return generatePeriodsFromConfig(config);
    }

    const lastPeriod = await getLastPeriodFn();
    
    if (!lastPeriod) {
        console.log('🔄 Modo incremental: nenhum registro encontrado, processando período completo');
        return generatePeriodsFromConfig(config);
    }

    // Calcular próximo período após o último registro
    let nextMes = lastPeriod.mes + 1;
    let nextAno = lastPeriod.ano;
    
    if (nextMes > 12) {
        nextMes = 1;
        nextAno += 1;
    }
    
    const incrementalStartDate: IPeriod = {
        mes: nextMes,
        ano: nextAno
    };

    // Verificar se o próximo período está dentro do período final configurado
    const endDate = config.endDate;
    const isNextPeriodValid = (incrementalStartDate.ano < endDate.ano) || 
                              (incrementalStartDate.ano === endDate.ano && incrementalStartDate.mes <= endDate.mes);

    if (!isNextPeriodValid) {
        const lastPeriodStr = `${lastPeriod.mes.toString().padStart(2, '0')}/${lastPeriod.ano}`;
        const endDateStr = `${endDate.mes.toString().padStart(2, '0')}/${endDate.ano}`;
        const nextPeriodStr = `${incrementalStartDate.mes.toString().padStart(2, '0')}/${incrementalStartDate.ano}`;
        
        console.log(`🔒 Modo incremental: dados já atualizados até o período máximo configurado`);
        console.log(`   📅 Último registro no banco: ${lastPeriodStr}`);
        console.log(`   📅 Período final configurado: ${endDateStr}`);
        console.log(`   📅 Próximo período seria: ${nextPeriodStr} (além do período final)`);
        console.log(`   ✅ Nenhum período novo para processar`);
        
        return []; // Retorna array vazio - nada para processar
    }
    
    console.log(`🔄 Modo incremental: coletando a partir de ${incrementalStartDate.mes.toString().padStart(2, '0')}/${incrementalStartDate.ano}`);
    
    // Criar nova configuração com a data de início incremental
    const incrementalConfig: IPeriodConfig = {
        startDate: incrementalStartDate,
        endDate: config.endDate
    };
    
    return generatePeriodsFromConfig(incrementalConfig);
}

/**
 * Gera períodos para modo incremental com detecção de lacunas
 * Identifica períodos faltantes entre o início configurado e o período final
 * @param service Nome do serviço (ICF, ICEC, PEIC)
 * @param getLastPeriodFn Função para buscar último período
 * @param getAllExistingPeriodsFn Função para buscar todos os períodos existentes
 * @returns Array de períodos faltantes para processar
 */
export async function generateServicePeriodsWithGapDetection(
    service: 'ICF' | 'ICEC' | 'PEIC',
    getLastPeriodFn: () => Promise<IPeriod | null>,
    getAllExistingPeriodsFn: () => Promise<IPeriod[]>
): Promise<IPeriod[]> {
    const processingMethod = process.env.PROCESSING_METHOD?.trim().replace(/'/g, '') || 'Incremental';
    
    console.log(`📋 Método de processamento configurado: ${processingMethod}`);

    const config = getServicePeriodConfig(service);

    // Modo Truncate and Load: processa período completo
    if (processingMethod === 'Truncate and Load') {
        console.log('🧹 Modo Truncate and Load: processando período completo');
        return generatePeriodsFromConfig(config);
    }

    // Modo Incremental com detecção de lacunas
    console.log('🔍 Modo incremental: detectando lacunas nos dados...');
    
    // Obter todos os períodos que deveriam existir (configuração completa)
    const allExpectedPeriods = generatePeriodsFromConfig(config);
    
    // Obter períodos existentes no banco
    const existingPeriods = await getAllExistingPeriodsFn();
    
    // Converter períodos existentes em Set para busca eficiente
    const existingPeriodsSet = new Set(
        existingPeriods.map(p => `${p.ano}-${p.mes.toString().padStart(2, '0')}`)
    );
    
    // Encontrar lacunas (períodos esperados que não existem no banco)
    const missingPeriods = allExpectedPeriods.filter(expected => {
        const key = `${expected.ano}-${expected.mes.toString().padStart(2, '0')}`;
        return !existingPeriodsSet.has(key);
    });

    console.log(`📊 Análise de lacunas concluída:`);
    console.log(`   📅 Períodos esperados: ${allExpectedPeriods.length}`);
    console.log(`   📅 Períodos existentes: ${existingPeriods.length}`);
    console.log(`   📅 Lacunas encontradas: ${missingPeriods.length}`);

    if (missingPeriods.length > 0) {
        console.log(`🔄 Processando lacunas encontradas:`);
        const firstMissing = missingPeriods[0];
        const lastMissing = missingPeriods[missingPeriods.length - 1];
        console.log(`   📅 Primeira lacuna: ${firstMissing.mes.toString().padStart(2, '0')}/${firstMissing.ano}`);
        console.log(`   📅 Última lacuna: ${lastMissing.mes.toString().padStart(2, '0')}/${lastMissing.ano}`);
        
        // Mostrar algumas lacunas como exemplo
        const sampleGaps = missingPeriods.slice(0, 5);
        console.log(`   📋 Exemplos de lacunas: ${sampleGaps.map(p => `${p.mes.toString().padStart(2, '0')}/${p.ano}`).join(', ')}`);
        if (missingPeriods.length > 5) {
            console.log(`   ... e mais ${missingPeriods.length - 5} lacunas`);
        }
    } else {
        console.log(`✅ Nenhuma lacuna encontrada - dados estão completos!`);
    }

    return missingPeriods;
}

/**
 * Obtém as regiões configuradas para um serviço específico no arquivo .env
 * @param service Nome do serviço (ICF, ICEC, PEIC)
 * @returns Array de regiões, padrão ['BR'] se não configurado
 */
export function getServiceRegions(service: 'ICF' | 'ICEC' | 'PEIC'): string[] {
    const envKey = `REGIONS_${service}`;
    const regionsValue = process.env[envKey];

    // Se não está configurado ou está vazio, retorna região padrão
    if (!regionsValue || regionsValue.trim() === '') {
        console.log(`⚠️ ${envKey} não configurado. Usando região padrão: BR`);
        return ['BR'];
    }

    try {
        // Split pela vírgula e remove espaços em branco
        const regions = regionsValue
            .split(',')
            .map(region => region.trim().toUpperCase())
            .filter(region => region.length > 0); // Remove strings vazias

        // Se após o processamento não sobrou nenhuma região válida, usar padrão
        if (regions.length === 0) {
            console.log(`⚠️ ${envKey} configurado mas sem regiões válidas. Usando região padrão: BR`);
            return ['BR'];
        }

        console.log(`✅ Regiões configuradas para ${service}: ${regions.join(', ')}`);
        return regions;

    } catch (error) {
        console.warn(`⚠️ Erro ao processar ${envKey}: ${error}. Usando região padrão: BR`);
        return ['BR'];
    }
}

/**
 * Extrai o período inicial e final de um array de períodos
 * @param periods Array de períodos gerados para um serviço
 * @returns Objeto com período inicial e final formatados (MM/AAAA)
 */
export function extractServicePeriodRange(periods: IPeriod[]): { periodoInicio: string; periodoFim: string } {
    if (periods.length === 0) {
        // Fallback caso não tenha períodos configurados
        return {
            periodoInicio: '01/2010',
            periodoFim: formatPeriod()
        };
    }

    // O primeiro período é o mais antigo (início)
    const primeiro = periods[0];
    // O último período é o mais recente (fim)
    const ultimo = periods[periods.length - 1];

    return {
        periodoInicio: `${primeiro.mes.toString().padStart(2, '0')}/${primeiro.ano}`,
        periodoFim: `${ultimo.mes.toString().padStart(2, '0')}/${ultimo.ano}`
    };
}

export const roundToOneDecimal = (value: number): number => {
    return Math.round(value * 10) / 10;
};

export function transformJsonToPEIC(jsonData: any[][]): peicXLSXCompleta {

    const result: peicXLSXTipo[] = [];
    let currentTipo: peicXLSXTipo | null = null;

    for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];

        // Ignorar linhas vazias ou com apenas nulls
        if (!row || row.every(cell => cell === null || cell === undefined)) {
            continue;
        }

        // Verifica se é uma linha de cabeçalho (nova categoria)
        // Para PEIC normal: "total - %" | "até 10sm - %" | "mais de 10sm - %" (layout 2025+)
        // Para PEIC normal (2016): "total" | "até 10 sm" | "mais de 10 sm"
        // Para PEIC (Sintese): "Numero Absoluto" | null | null (layout 2025+)
        // Para PEIC (Sintese 2016): "Total (absoluto)" | null | null
        const isNormalHeaderModerno = row[1] === "total - %" && row[2] === "até 10sm - %" &&
            row[3] && row[3].includes("mais de 10sm");
            
        const isNormalHeader2016 = row[1] === "total" && row[2] === "até 10 sm" &&
            row[3] === "mais de 10 sm";

        const isSinteseHeaderModerno = row[1] === "Numero Absoluto" && row[2] === null && row[3] === null;
        
        const isSinteseHeader2016 = row[1] === "Total (absoluto)" && row[2] === null && row[3] === null;
        
        const isHeader = isNormalHeaderModerno || isNormalHeader2016 || isSinteseHeaderModerno || isSinteseHeader2016;

        if (isHeader) {
            // Se já existe um tipo atual, adiciona ao resultado
            if (currentTipo) {
                result.push(currentTipo);
            }

            // Cria novo tipo
            currentTipo = {
                tipo: row[0],
                valores: []
            };
        } else if (currentTipo && row[0] && typeof row[0] === 'string' && row[0].trim() !== '') {
            // Verifica se é PEIC (Sintese) para tratar de forma diferente
            const isSintese = currentTipo.tipo === "PEIC (Sintese)";

            if (isSintese) {
                // Para PEIC (Sintese): apenas "Numero Absoluto" tem valor, resto é 0
                currentTipo.valores.push({
                    tipo: row[0],
                    total: "0",
                    "até 10sm - %": "0",
                    "mais de 10sm - %": "0",
                    "Numero Absoluto": row[1]
                });
            } else {
                // Para outros tipos: valores percentuais normais, "Numero Absoluto" é 0
                currentTipo.valores.push({
                    tipo: row[0],
                    total: row[1],
                    "até 10sm - %": row[2],
                    "mais de 10sm - %": row[3],
                    "Numero Absoluto": "0"
                });
            }
        }
    }

    // Adiciona o último tipo se existir
    if (currentTipo) {
        result.push(currentTipo);
    }

    return {
        peictableTipo: result
    };
}

export function transformJsonToICF(jsonData: any[][]): icfXLSXCompleta {
    const result: icfXLSXTipo[] = [];
    let currentTipo: icfXLSXTipo | null = null;

    // ========================================
    // FASE 1: EXTRAÇÃO INICIAL DOS DADOS
    // ========================================
    
    for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];

        // Verifica se é uma linha de cabeçalho (nova categoria)
        // Suporta três formatos:
        // Layout atual: row[1] === "TOTAL" && row[2] === "até 10sm - %" && row[3].includes("mais de 10sm")
        // Layout antigo: row[1] === "total - %" && row[2] === "até 10sm - %" && row[3].includes("mais de 10sm")  
        // Layout ICF em pontos: row[1] === "total - % (em pontos)" && row[2] === "até 10sm - % (em pontos)" && row[3].includes("mais de 10sm - % (em pontos)")
        const isHeaderLayoutAtual = row[1] === "TOTAL" && row[2] === "até 10sm - %" && row[3] && row[3].toString().includes("mais de 10sm");
        const isHeaderLayoutAntigo = row[1] === "total - %" && row[2] === "até 10sm - %" && row[3] && row[3].toString().includes("mais de 10sm");
        const isHeaderLayoutICFPontos = row[1] === "total - % (em pontos)" && row[2] === "até 10sm - % (em pontos)" && row[3] && row[3].toString().includes("mais de 10sm - % (em pontos)");
        
        if (isHeaderLayoutAtual || isHeaderLayoutAntigo || isHeaderLayoutICFPontos) {
            // Se já existe um tipo atual, adiciona ao resultado
            if (currentTipo) {
                result.push(currentTipo);
            }

            // Cria novo tipo
            currentTipo = {
                tipo: row[0],
                valores: []
            };
        } else if (currentTipo && row[0]) {
            // Verifica se é um índice verdadeiro (exclui "Índice (Variação Mensal)")
            const isIndice = (row[0] === "Índice" || row[0] === "Índice (Em Pontos)") &&
                row[0] !== "Índice (Variação Mensal)";

            // Adiciona o valor (seja índice ou não)
            currentTipo.valores.push({
                tipo: row[0],
                indice: isIndice,
                total: row[1],
                "até 10sm - %": row[2],
                "mais de 10sm - %": row[3]
            });
        }
    }

    // Adiciona o último tipo se existir
    if (currentTipo) {
        result.push(currentTipo);
    }

    // ========================================
    // FASE 2: DETECÇÃO E CORREÇÃO DE LAYOUT HISTÓRICO
    // ========================================
    
    // Calcular total de metadados para detectar o layout
    let totalMetadados = 0;
    for (const tipo of result) {
        totalMetadados += tipo.valores.length;
    }

    // Detectar layout histórico baseado em características específicas:
    // 1. Buscar por "Índice (Variação Mensal)" em QUALQUER parte dos dados extraídos
    // 2. Se existe, então é layout histórico com variação mensal (2012/05)
    // 3. Se não existe, verificar se "Momento para Duráveis" tem campos misturados
    
    let hasVariacaoMensalAnywhere = false;
    for (const tipo of result) {
        for (const valor of tipo.valores) {
            if (valor.tipo === 'Índice (Variação Mensal)') {
                hasVariacaoMensalAnywhere = true;
                break;
            }
        }
        if (hasVariacaoMensalAnywhere) break;
    }
    
    const momentoDuraveisTipo = result.find(tipo => tipo.tipo === 'Momento para Duráveis');
    const hasICFInMomento = momentoDuraveisTipo?.valores.some(valor => valor.tipo === 'ICF (Variação Mensal)') || false;
    const momentoFieldCount = momentoDuraveisTipo?.valores.length || 0;
    
    // Verificar se "Momento para Duráveis" tem campos que pertencem ao ICF (campos misturados)
    const camposICFEmMomento = momentoDuraveisTipo?.valores.some(valor => 
        ['Emprego Atual', 'Perspectiva Profissional', 'Renda Atual', 'Acesso ao crédito', 
         'Compra a Prazo (Acesso ao crédito)', 'Nível de Consumo Atual', 'Perspectiva de Consumo',
         'ICF (em pontos)', 'Índice (Em Pontos)'].includes(valor.tipo)
    ) || false;
    
    // Layout histórico COM variação mensal: tem "Índice (Variação Mensal)" E campos misturados
    const isLayoutHistoricoComVariacao = hasVariacaoMensalAnywhere && 
                                        (hasICFInMomento || camposICFEmMomento || momentoFieldCount > 10);
    
    // Layout histórico SEM variação mensal mas COM campos misturados: tem campos ICF em Momento para Duráveis
    const isLayoutHistoricoSemVariacaoMisturado = !hasVariacaoMensalAnywhere && camposICFEmMomento;
    
    // Layout normal SEM variação mensal e SEM mistura: estrutura padrão
    const isLayoutNormalSemVariacao = !hasVariacaoMensalAnywhere && !camposICFEmMomento;
    
    if (isLayoutHistoricoComVariacao) {
        console.log('🔍 Layout histórico ICF detectado (2012-2020) - aplicando correção de estrutura...');
        
        // Encontrar a seção "Momento para Duráveis" que contém dados misturados
        const momentoDuraveisTipo = result.find(tipo => tipo.tipo === 'Momento para Duráveis');
        
        if (momentoDuraveisTipo) {
            console.log(`🔧 Separando campos misturados em "Momento para Duráveis" (${momentoDuraveisTipo.valores.length} campos)...`);
            
            // Campos que pertencem genuinamente ao "Momento para Duráveis"
            const camposMomentoDuraveis = ['Bom', 'Mau', 'Não Sabe', 'Não Respondeu', 'Índice'];
            
            // Campos que pertencem ao "ICF (Variação Mensal)"
            const camposICFVariacao = [
                'Emprego Atual', 'Perspectiva Profissional', 'Renda Atual', 
                'Compra a Prazo (Acesso ao crédito)', 'Acesso ao crédito', // Ambas as variações do nome
                'Nível de Consumo Atual', 'Perspectiva de Consumo', 'Momento para Duráveis', 
                'ICF (em pontos)', 'Índice (Variação Mensal)', 'Índice (Em Pontos)'
            ];
            
            // Separar os campos em duas listas
            const valoresMomento = [];
            const valoresICFVariacao = [];
            
            for (const valor of momentoDuraveisTipo.valores) {
                if (camposMomentoDuraveis.includes(valor.tipo)) {
                    valoresMomento.push(valor);
                } else if (camposICFVariacao.includes(valor.tipo) || valor.tipo === 'ICF (Variação Mensal)') {
                    // Se for o campo "ICF (Variação Mensal)", ignorar (é apenas cabeçalho)
                    if (valor.tipo !== 'ICF (Variação Mensal)') {
                        // Correção de nomenclatura: "Índice (Em Pontos)" deve ser "ICF (em pontos)" 
                        if (valor.tipo === 'Índice (Em Pontos)') {
                            valor.tipo = 'ICF (em pontos)';
                        }
                        valoresICFVariacao.push(valor);
                    }
                } else {
                    // Campos não identificados - manter em Momento para Duráveis por segurança
                    console.log(`⚠️ Campo não identificado: ${valor.tipo} - mantendo em Momento para Duráveis`);
                    valoresMomento.push(valor);
                }
            }
            
            console.log(`📊 Separação concluída:`);
            console.log(`  - Momento para Duráveis: ${valoresMomento.length} campos`);
            console.log(`  - ICF (Variação Mensal): ${valoresICFVariacao.length} campos`);
            
            // Atualizar "Momento para Duráveis" apenas com seus campos genuínos
            momentoDuraveisTipo.valores = valoresMomento;
            
            // Verificar se já existe seção separada "ICF (Variação Mensal)"
            let icfVariacaoSeparada = result.find(tipo => tipo.tipo === 'ICF (Variação Mensal)');
            
            if (!icfVariacaoSeparada && valoresICFVariacao.length > 0) {
                console.log('🆕 Criando seção separada "ICF (Variação Mensal)" com os campos extraídos...');
                
                // Criar nova seção com os campos extraídos
                icfVariacaoSeparada = {
                    tipo: 'ICF (Variação Mensal)',
                    valores: valoresICFVariacao
                };
                
                result.push(icfVariacaoSeparada);
            } else if (icfVariacaoSeparada && valoresICFVariacao.length > 0) {
                console.log('🔄 Mesclando campos extraídos com seção "ICF (Variação Mensal)" existente...');
                
                // Mesclar com seção existente, evitando duplicatas
                for (const valor of valoresICFVariacao) {
                    const jaExiste = icfVariacaoSeparada.valores.some(v => v.tipo === valor.tipo);
                    if (!jaExiste) {
                        icfVariacaoSeparada.valores.push(valor);
                    }
                }
            }
            
            console.log('✅ Layout histórico COM variação mensal corrigido: campos separados adequadamente');
        }
    } else if (isLayoutHistoricoSemVariacaoMisturado) {
        console.log('🔍 Layout histórico SEM variação mensal MAS com campos misturados detectado (ex: 2012/03 problemático)');
        console.log('🔧 Separando campos misturados em "Momento para Duráveis"...');
        
        // Encontrar a seção "Momento para Duráveis" que contém dados misturados
        const momentoDuraveisTipo = result.find(tipo => tipo.tipo === 'Momento para Duráveis');
        
        if (momentoDuraveisTipo) {
            console.log(`🔧 Separando campos misturados em "Momento para Duráveis" (${momentoDuraveisTipo.valores.length} campos)...`);
            
            // Campos que pertencem genuinamente ao "Momento para Duráveis"
            const camposMomentoDuraveis = ['Bom', 'Mau', 'Não Sabe', 'Não Respondeu', 'Índice'];
            
            // Campos que pertencem ao "ICF (em pontos)" (seção separada)
            const camposICFPontos = [
                'Emprego Atual', 'Perspectiva Profissional', 'Renda Atual', 
                'Compra a Prazo (Acesso ao crédito)', 'Acesso ao crédito',
                'Nível de Consumo Atual', 'Perspectiva de Consumo', 'Momento para Duráveis',
                'ICF (em pontos)', 'Índice (Em Pontos)'
            ];
            
            // Separar os campos em duas listas
            const valoresMomento = [];
            const valoresICFPontos = [];
            
            for (const valor of momentoDuraveisTipo.valores) {
                if (camposMomentoDuraveis.includes(valor.tipo)) {
                    valoresMomento.push(valor);
                } else if (camposICFPontos.includes(valor.tipo)) {
                    // Correção de nomenclatura: "Índice (Em Pontos)" deve ser "ICF (em pontos)" 
                    if (valor.tipo === 'Índice (Em Pontos)') {
                        valor.tipo = 'ICF (em pontos)';
                    }
                    valoresICFPontos.push(valor);
                } else {
                    // Campos não identificados - manter em Momento para Duráveis por segurança
                    console.log(`⚠️ Campo não identificado: ${valor.tipo} - mantendo em Momento para Duráveis`);
                    valoresMomento.push(valor);
                }
            }
            
            console.log(`📊 Separação concluída:`);
            console.log(`  - Momento para Duráveis: ${valoresMomento.length} campos`);
            console.log(`  - ICF (em pontos): ${valoresICFPontos.length} campos`);
            
            // Atualizar "Momento para Duráveis" apenas com seus campos genuínos
            momentoDuraveisTipo.valores = valoresMomento;
            
            // Verificar se já existe seção "ICF (em pontos)"
            let icfPontosSection = result.find(tipo => tipo.tipo === 'ICF (em pontos)');
            
            if (!icfPontosSection && valoresICFPontos.length > 0) {
                console.log('🆕 Criando seção separada "ICF (em pontos)" com os campos extraídos...');
                
                // Criar nova seção com os campos extraídos
                icfPontosSection = {
                    tipo: 'ICF (em pontos)',
                    valores: valoresICFPontos
                };
                
                result.push(icfPontosSection);
            } else if (icfPontosSection && valoresICFPontos.length > 0) {
                console.log('🔄 Mesclando campos extraídos com seção "ICF (em pontos)" existente...');
                
                // Mesclar com seção existente, evitando duplicatas
                for (const valor of valoresICFPontos) {
                    const jaExiste = icfPontosSection.valores.some(v => v.tipo === valor.tipo);
                    if (!jaExiste) {
                        icfPontosSection.valores.push(valor);
                    }
                }
            }
            
            console.log('✅ Layout histórico SEM variação mensal corrigido: campos separados adequadamente');
        }
        
    } else if (isLayoutNormalSemVariacao) {
        console.log('✅ Layout normal SEM variação mensal detectado - estrutura padrão mantida');
        console.log('ℹ️ Este período não possui "Índice (Variação Mensal)" e tem estrutura correta');
        
    } else {
        console.log('✅ Layout moderno ICF detectado (2021+) - estrutura padrão mantida');
    }

    return {
        icftableTipo: result
    };
}

export function transformJsonToICEC(jsonData: any[][]): icecXLSXCompleta {
    const result: icecXLSXTipo[] = [];
    let currentTipo: icecXLSXTipo | null = null;
    let currentTipoPesquisa: string = '';

    // Função helper para verificar se é a primeira linha inválida (com nulls e "Porte")
    const isInvalidFirstLine = (row: any[]): boolean => {
        return row[0] === null && row[1] === null && row[2] === "Porte";
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
        return currentTipoPesquisa; // Mantém o tipo anterior se não encontrar
    };

    for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];

        // Ignorar linha inválida do início
        if (isInvalidFirstLine(row)) {
            continue;
        }

        // Verifica se é uma linha de cabeçalho (nova categoria)
        // Tipo 1: Categorias normais com "total - em %"
        // Tipo 2: Categorias de variação mensal com "Total"
        const isNormalHeader = row[1] === "total - em %" && row[2] === "Empresas com até 50 empregados" && row[3] === "Empresas com mais de 50 empregados";
        const isVariacaoMensalHeader = row[1] === "Total" && row[2] === "Empresas com até 50 empregados" && row[3] === "Empresas com mais de 50 empregados";

        if (isNormalHeader || isVariacaoMensalHeader) {
            // Se já existe um tipo atual, adiciona ao resultado
            if (currentTipo) {
                result.push(currentTipo);
            }

            // Extrai o tipo de pesquisa do cabeçalho
            currentTipoPesquisa = extractTipoPesquisa(row);

            // Cria novo tipo (usar apenas o nome da categoria, ignorando qualquer título de índice na coluna 7)
            currentTipo = {
                tipo: row[0],
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
