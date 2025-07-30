import axios from 'axios';
import * as XLSX from 'xlsx';
import * as fs from 'fs-extra';
import * as path from 'path';
import { icfRepository } from '../database/repositories';
import { Icf } from '../database/entities';
import { Regiao } from '../shared/interfaces';

interface IcfPontosData {
    NC_PONTOS: number;
    ATE_10_SM_PONTOS: number;
    MAIS_DE_10_SM_PONTOS: number;
}

export class IcfService {
    private readonly TEMP_DIR = path.join(__dirname, '../../../temp');
    private readonly TIMEOUT = 30000;

    constructor() {
        this.ensureTempDirectory();
    }

    public async testSinglePeriod(mes: number, ano: number, regiao: string = 'BR'): Promise<void> {
        try {
            console.log(`📊 Testando ICF ${regiao} ${mes.toString().padStart(2, '0')}/${ano}`);

            const currentUrl = this.buildUrl(mes, ano, regiao);
            const currentFilePath = await this.downloadExcelFile(currentUrl, `${regiao}_${mes}_${ano}`);
            const currentData = await this.extractPointsFromExcel(currentFilePath);

            const previousPeriod = this.getPreviousPeriod(mes, ano);
            let icfData: Icf;

            if (previousPeriod) {
                const previousUrl = this.buildUrl(previousPeriod.mes, previousPeriod.ano, regiao);
                const previousFilePath = await this.downloadExcelFile(previousUrl, `${regiao}_${previousPeriod.mes}_${previousPeriod.ano}`);
                const previousData = await this.extractPointsFromExcel(previousFilePath);
                icfData = this.calculatePercentages(currentData, previousData);
                await this.cleanupTempFiles([previousFilePath]);
            } else {
                icfData = this.calculatePercentages(currentData, { NC_PONTOS: 0, ATE_10_SM_PONTOS: 0, MAIS_DE_10_SM_PONTOS: 0 });
            }

            icfData.MES = mes;
            icfData.ANO = ano;
            icfData.REGIAO = regiao as Regiao;

            console.log('📈 Dados extraídos:', icfData);

            await this.saveToDatabase(icfData);
            await this.cleanupTempFiles([currentFilePath]);

            console.log(`✅ ICF ${regiao} ${mes.toString().padStart(2, '0')}/${ano} processado com sucesso`);

        } catch (error) {
            console.log(`❌ Erro ao processar ICF ${regiao} ${mes.toString().padStart(2, '0')}/${ano}: ${error}`);
            throw error;
        }
    }

    private async ensureTempDirectory(): Promise<void> {
        try {
            await fs.ensureDir(this.TEMP_DIR);
        } catch (error) {
            throw new Error(`Erro ao criar diretório temporário: ${error}`);
        }
    }

    private buildUrl(mes: number, ano: number, regiao: string = 'BR'): string {
        return `https://backend.pesquisascnc.com.br/admin/4/upload/${mes}_${ano}/ICF/${regiao}.xls`;
    }

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

    private async extractPointsFromExcel(filePath: string): Promise<IcfPontosData> {
        try {
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null }) as any[][];

            let lastValidRow: any[] | null = null;
            
            for (let i = jsonData.length - 1; i >= 0; i--) {
                const row = jsonData[i];
                if (row && Array.isArray(row) && row.length >= 4) {
                    const firstCell = String(row[0] || '').toLowerCase().trim();
                    if (firstCell.includes('índice (em pontos)')) {
                        const numericValues = row.slice(1, 4).map(val => {
                            const num = parseFloat(String(val || '0').replace(',', '.'));
                            return isNaN(num) ? 0 : num;
                        });
                        
                        if (numericValues.some(val => val > 0)) {
                            lastValidRow = row;
                            break;
                        }
                    }
                }
            }

            if (!lastValidRow) {
                throw new Error('Linha com dados ICF não encontrada');
            }

            const numericData = lastValidRow.slice(1, 4).map(val => {
                const num = parseFloat(String(val || '0').replace(',', '.'));
                return isNaN(num) ? 0 : num;
            });

            return {
                NC_PONTOS: numericData[0],
                ATE_10_SM_PONTOS: numericData[1],
                MAIS_DE_10_SM_PONTOS: numericData[2]
            };
        } catch (error) {
            throw new Error(`Erro ao processar arquivo Excel ICF: ${error}`);
        }
    }

    private calculatePercentages(currentData: IcfPontosData, previousData: IcfPontosData): Icf {
        const calculatePercentage = (current: number, previous: number): number => {
            if (previous === 0) return 0;
            const percentage = ((current - previous) / previous) * 100;
            return Math.round(percentage * 10) / 10;
        };

        return {
            NC_PONTOS: currentData.NC_PONTOS,
            ATE_10_SM_PONTOS: currentData.ATE_10_SM_PONTOS,
            MAIS_DE_10_SM_PONTOS: currentData.MAIS_DE_10_SM_PONTOS,
            NC_PERCENTUAL: calculatePercentage(currentData.NC_PONTOS, previousData.NC_PONTOS),
            ATE_10_SM_PERCENTUAL: calculatePercentage(currentData.ATE_10_SM_PONTOS, previousData.ATE_10_SM_PONTOS),
            MAIS_DE_10_SM_PERCENTUAL: calculatePercentage(currentData.MAIS_DE_10_SM_PONTOS, previousData.MAIS_DE_10_SM_PONTOS),
            MES: 0,
            ANO: 0,
            REGIAO: Regiao.BR // Valor padrão, será sobrescrito
        };
    }

    private async saveToDatabase(data: Icf): Promise<void> {
        try {
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

            await icfRepository.save(icfEntity);
        } catch (error) {
            throw new Error(`Erro ao salvar ICF no banco: ${error}`);
        }
    }

    private async cleanupTempFiles(filePaths: string[]): Promise<void> {
        for (const filePath of filePaths) {
            try {
                await fs.remove(filePath);
            } catch (error) {
                console.warn(`Aviso: não foi possível remover arquivo temporário: ${filePath}`);
            }
        }
    }

    private generatePeriods(): Array<{mes: number, ano: number}> {
        const periods = [];
        const startDate = new Date(2012, 3); // Abril 2012 (mês 0-indexed)
        const currentDate = new Date();
        
        let date = new Date(startDate);
        while (date <= currentDate) {
            periods.push({
                mes: date.getMonth() + 1,
                ano: date.getFullYear()
            });
            date.setMonth(date.getMonth() + 1);
        }
        
        return periods;
    }

    private getPreviousPeriod(mes: number, ano: number): {mes: number, ano: number} {
        if (mes === 1) {
            return { mes: 12, ano: ano - 1 };
        }
        return { mes: mes - 1, ano };
    }

    public async processAllIcfData(regioes: string[] = ['BR']): Promise<void> {
        console.log(`=== Iniciando processamento em massa do ICF ===`);
        console.log(`📍 Regiões a processar: ${regioes.join(', ')}`);
        
        const periods = this.generatePeriods();
        let successCount = 0;
        let errorCount = 0;
        const totalProcessos = periods.length * regioes.length;

        console.log(`Total de períodos a processar: ${totalProcessos}`);

        for (const period of periods) {
            for (const regiao of regioes) {
                const tempFilePaths: string[] = [];

                try {
                    console.log(`Processando período: ${regiao} ${period.mes.toString().padStart(2, '0')}/${period.ano}`);
                    
                    const previousPeriod = this.getPreviousPeriod(period.mes, period.ano);
                    
                    const currentUrl = this.buildUrl(period.mes, period.ano, regiao);
                    const previousUrl = this.buildUrl(previousPeriod.mes, previousPeriod.ano, regiao);
                    
                    const [currentFilePath, previousFilePath] = await Promise.all([
                        this.downloadExcelFile(currentUrl, `${regiao}_atual`),
                        this.downloadExcelFile(previousUrl, `${regiao}_anterior`)
                    ]);
                    
                    tempFilePaths.push(currentFilePath, previousFilePath);
                    
                    const [currentData, previousData] = await Promise.all([
                        this.extractPointsFromExcel(currentFilePath),
                        this.extractPointsFromExcel(previousFilePath)
                    ]);
                    
                    const completeData = this.calculatePercentages(currentData, previousData);
                    completeData.MES = period.mes;
                    completeData.ANO = period.ano;
                    completeData.REGIAO = regiao as Regiao;
                    
                    await this.saveToDatabase(completeData);
                    
                    successCount++;
                    console.log(`✓ Período ${regiao} ${period.mes.toString().padStart(2, '0')}/${period.ano} processado com sucesso`);

                } catch (error) {
                    errorCount++;
                    console.error(`✗ Erro no período ${regiao} ${period.mes.toString().padStart(2, '0')}/${period.ano}:`, error);
                } finally {
                    await this.cleanupTempFiles(tempFilePaths);
                }
            }
        }

        console.log(`=== Processamento concluído ===`);
        console.log(`Sucessos: ${successCount}`);
        console.log(`Erros: ${errorCount}`);
        console.log(`Total: ${totalProcessos}`);
    }
}
