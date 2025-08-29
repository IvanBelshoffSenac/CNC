import { format } from 'date-fns';
import * as fs from 'fs-extra';
import * as path from 'path';
import { icfXLSXCompleta, icfXLSXTipo, IPeriod, peicXLSXCompleta, peicXLSXTipo } from './interfaces';


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
export async function cleanupServiceTempFolder(serviceName: string, tempDir: string): Promise<void> {
    try {
        console.log(`🧹 Iniciando limpeza da pasta temp para ${serviceName.toUpperCase()}...`);

        if (!await fs.pathExists(tempDir)) {
            console.log(`📁 Pasta temp não existe: ${tempDir}`);
            return;
        }

        const files = await fs.readdir(tempDir);

        // Filtrar apenas arquivos do serviço específico
        const servicePattern = new RegExp(`^${serviceName.toLowerCase()}_`, 'i');
        const serviceFiles = files.filter(file =>
            servicePattern.test(file) &&
            (file.endsWith('.xls') || file.endsWith('.xlsx'))
        );

        if (serviceFiles.length === 0) {
            console.log(`📄 Nenhum arquivo temporário do ${serviceName.toUpperCase()} encontrado`);
            return;
        }

        console.log(`📄 Encontrados ${serviceFiles.length} arquivo(s) temporário(s) do ${serviceName.toUpperCase()}`);

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
 * Gera períodos para um serviço específico baseado na configuração do .env
 * @param service Nome do serviço (ICF, ICEC, PEIC)
 * @returns Array de períodos para o serviço
 */
export function generateServicePeriods(service: 'ICF' | 'ICEC' | 'PEIC'): IPeriod[] {
    const config = getServicePeriodConfig(service);
    return generatePeriodsFromConfig(config);
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

        // Verifica se é uma linha de cabeçalho (nova categoria)
        // Para PEIC: TOTAL | até 10sm - % | mais de 10sm - % | Numero Absoluto
        if (row[1] === "TOTAL" && row[2] === "até 10sm - %" && row[3].includes("mais de 10sm") && row[4] === "Numero Absoluto") {
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
            // Adiciona o valor
            currentTipo.valores.push({
                tipo: row[0],
                total: parseFloat(row[1]?.toString() || '0'),
                "até 10sm - %": parseFloat(row[2]?.toString() || '0'),
                "mais de 10sm - %": parseFloat(row[3]?.toString() || '0'),
                "Numero Absoluto": parseFloat(row[4]?.toString() || '0')
            });
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

    for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];

        // Verifica se é uma linha de cabeçalho (nova categoria)
        if (row[1] === "TOTAL" && row[2] === "até 10sm - %" && row[3].includes("mais de 10sm")) {
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
                total: parseFloat(row[1].toString()),
                "até 10sm - %": parseFloat(row[2].toString()),
                "mais de 10sm - %": parseFloat(row[3].toString())
            });
        }
    }

    // Adiciona o último tipo se existir
    if (currentTipo) {
        result.push(currentTipo);
    }

    return {
        icftableTipo: result
    };
}
