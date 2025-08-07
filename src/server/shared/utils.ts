import { format } from 'date-fns';
import * as fs from 'fs-extra';
import * as path from 'path';
import { IPeriod } from './interfaces';


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
