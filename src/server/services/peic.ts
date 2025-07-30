import axios from 'axios';
import * as XLSX from 'xlsx';
import * as fs from 'fs-extra';
import * as path from 'path';
import { peicRepository } from '../database/repositories';
import { Peic } from '../database/entities';
import { Regiao } from '../shared/interfaces';

export class PeicService {
    private baseUrl = process.env.BASE_URL || 'https://backend.pesquisascnc.com.br/admin/4/upload';

    public async processAllPeicData(regioes: string[] = ['BR']): Promise<void> {
        console.log('🚀 Iniciando processamento completo dos dados PEIC...\n');
        console.log(`📍 Regiões a processar: ${regioes.join(', ')}\n`);

        const periods = this.generatePeriods();
        let processados = 0;
        let sucessos = 0;
        let erros = 0;
        const totalProcessos = periods.length * regioes.length;

        for (const period of periods) {
            for (const regiao of regioes) {
                try {
                    console.log(`Processando período: ${regiao} ${period.mes.toString().padStart(2, '0')}/${period.ano}`);

                    const filePath = await this.downloadFile(period.mes, period.ano, regiao);
                    const data = await this.extractDataFromExcel(filePath, period.mes, period.ano, regiao);
                    await this.saveToDatabase(data);
                    await this.cleanupTempFile(filePath);

                    console.log(`✅ Período ${regiao} ${period.mes.toString().padStart(2, '0')}/${period.ano} processado com sucesso`);
                    sucessos++;

                } catch (error) {
                    console.log(`✗ Erro no período ${regiao} ${period.mes.toString().padStart(2, '0')}/${period.ano}: ${error}`);
                    erros++;
                }

                processados++;
            }
        }

        console.log(`\n=== Processamento concluído ===`);
        console.log(`Sucessos: ${sucessos}`);
        console.log(`Erros: ${erros}`);
        console.log(`Total: ${totalProcessos}`);
    }

    private generatePeriods(): Array<{ mes: number; ano: number }> {
        const periods: Array<{ mes: number; ano: number }> = [];
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1;

        // Março 2012 até período atual
        for (let ano = 2012; ano <= currentYear; ano++) {
            const startMonth = ano === 2012 ? 3 : 1;
            const endMonth = ano === currentYear ? currentMonth : 12;

            for (let mes = startMonth; mes <= endMonth; mes++) {
                periods.push({ mes, ano });
            }
        }

        return periods;
    }

    private buildUrl(mes: number, ano: number, regiao: string = 'BR'): string {
        return `${this.baseUrl}/${mes}_${ano}/PEIC/${regiao}.xls`;
    }

    private async downloadFile(mes: number, ano: number, regiao: string = 'BR'): Promise<string> {
        try {
            const url = this.buildUrl(mes, ano, regiao);
            const response = await axios.get(url, { responseType: 'stream' });

            const tempDir = path.join(process.cwd(), 'temp');
            await fs.ensureDir(tempDir);

            const filePath = path.join(tempDir, `peic_${regiao}_${mes}_${ano}.xls`);
            const writer = fs.createWriteStream(filePath);

            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', () => resolve(filePath));
                writer.on('error', reject);
            });
        } catch (error) {
            throw new Error(`Erro ao baixar arquivo PEIC: ${error}`);
        }
    }

    private async extractDataFromExcel(filePath: string, mes: number, ano: number, regiao: string = 'BR'): Promise<Peic> {
        try {
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null }) as any[][];

            const peicData: Partial<Peic> = {
                MES: mes,
                ANO: ano,
                REGIAO: regiao as Regiao
            };

            // Extrair dados percentuais (linhas 54, 55, 56)
            this.extractPercentualData(jsonData, peicData);

            // Extrair dados absolutos (linhas 60, 61, 62)
            this.extractAbsolutoData(jsonData, peicData);

            // Verificar se todos os campos obrigatórios foram preenchidos
            if (!this.isValidPeicData(peicData)) {
                throw new Error('Dados PEIC incompletos extraídos do arquivo');
            }

            return peicData as Peic;
        } catch (error) {
            throw new Error(`Erro ao processar arquivo PEIC: ${error}`);
        }
    }

    private extractPercentualData(jsonData: any[][], peicData: Partial<Peic>): void {
        // Buscar especificamente a seção "PEIC (Percentual)"
        for (let i = 0; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (row && row[0]) {
                const cellText = String(row[0]).toLowerCase();
                
                // Identificar a seção PEIC (Percentual)
                if (cellText.includes('peic') && cellText.includes('percentual')) {
                    // Processar as próximas linhas desta seção (geralmente linhas 54, 55, 56)
                    for (let j = i + 1; j < Math.min(i + 10, jsonData.length); j++) {
                        const dataRow = jsonData[j];
                        if (dataRow && dataRow[0] && dataRow[1] !== null && dataRow[1] !== undefined) {
                            const dataText = String(dataRow[0]).toLowerCase();
                            
                            // Verificar se é um valor decimal (percentual) - valores absolutos são maiores que 1000
                            if (typeof dataRow[1] === 'number' && dataRow[1] < 1) {
                                // Linha 54: Famílias endividadas
                                if (dataText.includes('famílias endividadas') && 
                                    !dataText.includes('atraso') && 
                                    !dataText.includes('condições') &&
                                    !peicData.ENDIVIDADOS_PERCENTUAL) {
                                    const value = this.parsePercentual(dataRow[1]);
                                    peicData.ENDIVIDADOS_PERCENTUAL = value;
                                }
                                // Linha 55: Famílias com conta em Atraso
                                else if (dataText.includes('famílias com conta em atraso') && 
                                         !dataText.includes('condições') &&
                                         !peicData.CONTAS_EM_ATRASO_PERCENTUAL) {
                                    const value = this.parsePercentual(dataRow[1]);
                                    peicData.CONTAS_EM_ATRASO_PERCENTUAL = value;
                                }
                                // Linha 56: Famílias que não terão condições de pagar
                                else if (dataText.includes('famílias que não terão condições de pagar') &&
                                         !peicData.NÃO_TERAO_CONDICOES_DE_PAGAR_PERCENTUAL) {
                                    const value = this.parsePercentual(dataRow[1]);
                                    peicData.NÃO_TERAO_CONDICOES_DE_PAGAR_PERCENTUAL = value;
                                }
                            }
                        }
                    }
                    break; // Sair do loop após encontrar a seção
                }
            }
        }
    }

    private extractAbsolutoData(jsonData: any[][], peicData: Partial<Peic>): void {
        // Buscar especificamente a seção "PEIC (Síntese)"
        for (let i = 0; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (row && row[0]) {
                const cellText = String(row[0]).toLowerCase();
                
                // Identificar a seção PEIC (Síntese)
                if (cellText.includes('peic') && cellText.includes('sintese')) {
                    // Processar as próximas linhas desta seção (geralmente linhas 60, 61, 62)
                    for (let j = i + 1; j < Math.min(i + 10, jsonData.length); j++) {
                        const dataRow = jsonData[j];
                        if (dataRow && dataRow[0] && dataRow[1] !== null && dataRow[1] !== undefined) {
                            const dataText = String(dataRow[0]).toLowerCase();
                            
                            // Verificar se é um valor absoluto (números grandes) - valores absolutos são maiores que 1000
                            if (typeof dataRow[1] === 'number' && dataRow[1] > 1000) {
                                // Linha 60: Famílias endividadas (absoluto)
                                if (dataText.includes('famílias endividadas') && 
                                    !dataText.includes('atraso') && 
                                    !dataText.includes('condições') &&
                                    !peicData.ENDIVIDADOS_ABSOLUTO) {
                                    const value = this.parseAbsoluto(dataRow[1]);
                                    peicData.ENDIVIDADOS_ABSOLUTO = value;
                                }
                                // Linha 61: Famílias com conta em Atraso (absoluto)
                                else if (dataText.includes('famílias com conta em atraso') && 
                                         !dataText.includes('condições') &&
                                         !peicData.CONTAS_EM_ATRASO_ABSOLUTO) {
                                    const value = this.parseAbsoluto(dataRow[1]);
                                    peicData.CONTAS_EM_ATRASO_ABSOLUTO = value;
                                }
                                // Linha 62: Famílias que não terão condições de pagar (absoluto)
                                else if (dataText.includes('famílias que não terão condições de pagar') &&
                                         !peicData.NAO_TERÃO_CONDICOES_DE_PAGAR_ABSOLUTO) {
                                    const value = this.parseAbsoluto(dataRow[1]);
                                    peicData.NAO_TERÃO_CONDICOES_DE_PAGAR_ABSOLUTO = value;
                                }
                            }
                        }
                    }
                    break; // Sair do loop após encontrar a seção
                }
            }
        }
    }

    private parsePercentual(value: any): number {
        if (typeof value === 'number') {
            // Converter valores decimais para porcentagem (valores menores que 1 são decimais)
            // Exemplo: 0.578 → 57.8%
            return value < 1 ? Math.round(value * 100 * 10) / 10 : value;
        }
        
        const strValue = String(value).replace(/[%,\s]/g, '').replace(',', '.');
        const num = parseFloat(strValue);
        
        if (isNaN(num)) {
            return 0;
        }
        
        // Aplicar a mesma lógica para strings
        return num < 1 ? Math.round(num * 100 * 10) / 10 : num;
    }

    private parseAbsoluto(value: any): string {
        if (typeof value === 'number') {
            // Arredondar e formatar com separadores brasileiros
            return Math.round(value).toLocaleString('pt-BR');
        }
        
        if (typeof value === 'string') {
            // Tentar converter string para número e depois formatar
            const cleanValue = value.replace(/[^\d.,]/g, '').replace(',', '.');
            const num = parseFloat(cleanValue);
            
            if (!isNaN(num)) {
                return Math.round(num).toLocaleString('pt-BR');
            }
        }
        
        return String(value);
    }

    private isValidPeicData(data: Partial<Peic>): data is Peic {
        return (
            typeof data.ENDIVIDADOS_PERCENTUAL === 'number' &&
            typeof data.CONTAS_EM_ATRASO_PERCENTUAL === 'number' &&
            typeof data.NÃO_TERAO_CONDICOES_DE_PAGAR_PERCENTUAL === 'number' &&
            typeof data.ENDIVIDADOS_ABSOLUTO === 'string' &&
            typeof data.CONTAS_EM_ATRASO_ABSOLUTO === 'string' &&
            typeof data.NAO_TERÃO_CONDICOES_DE_PAGAR_ABSOLUTO === 'string' &&
            typeof data.MES === 'number' &&
            typeof data.ANO === 'number'
        );
    }

    private async saveToDatabase(data: Peic): Promise<void> {
        try {
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

            await peicRepository.save(peicEntity);
        } catch (error) {
            throw new Error(`Erro ao salvar PEIC no banco: ${error}`);
        }
    }

    private async cleanupTempFile(filePath: string): Promise<void> {
        try {
            await fs.remove(filePath);
        } catch (error) {
            // Ignora erro de limpeza
        }
    }

    // Método público para teste
    public async testSinglePeriod(mes: number, ano: number, regiao: string = 'BR'): Promise<void> {
        try {
            console.log(`📊 Testando PEIC ${regiao} ${mes.toString().padStart(2, '0')}/${ano}`);

            const filePath = await this.downloadFile(mes, ano, regiao);
            const data = await this.extractDataFromExcel(filePath, mes, ano, regiao);
            
            console.log('📈 Dados extraídos:', data);
            
            await this.saveToDatabase(data);
            await this.cleanupTempFile(filePath);

            console.log(`✅ PEIC ${regiao} ${mes.toString().padStart(2, '0')}/${ano} processado com sucesso`);

        } catch (error) {
            console.log(`❌ Erro ao processar PEIC ${regiao} ${mes.toString().padStart(2, '0')}/${ano}: ${error}`);
            throw error;
        }
    }
}

export const peicService = new PeicService();
