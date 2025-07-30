import axios from 'axios';
import * as XLSX from 'xlsx';
import * as fs from 'fs-extra';
import * as path from 'path';
import { Icec } from '../database/entities/Icec';
import { icecRepository } from '../database/repositories/icecRepository';
import { Regiao } from '../shared/interfaces';

export class IcecService {
    private baseUrl = process.env.BASE_URL || 'https://backend.pesquisascnc.com.br/admin/4/upload';

    public async processAllIcecData(regioes: string[] = ['BR']): Promise<void> {
        console.log('🚀 Iniciando processamento completo dos dados ICEC...\n');
        console.log(`📍 Regiões a processar: ${regioes.join(', ')}\n`);

        const periods = this.generatePeriods();
        let processados = 0;
        let sucessos = 0;
        let falhas = 0;

        for (const period of periods) {
            for (const regiao of regioes) {
                try {
                    console.log(`📊 Processando ICEC ${regiao} ${period.mes.toString().padStart(2, '0')}/${period.ano}`);

                    const filePath = await this.downloadFile(period.mes, period.ano, regiao);
                    const data = await this.extractDataFromExcel(filePath, period.mes, period.ano, regiao);
                    await this.saveToDatabase(data);
                    await this.cleanupTempFile(filePath);

                    console.log(`✅ ICEC ${regiao} ${period.mes.toString().padStart(2, '0')}/${period.ano} processado com sucesso`);
                    sucessos++;

                } catch (error) {
                    console.log(`❌ Erro ao processar ICEC ${regiao} ${period.mes.toString().padStart(2, '0')}/${period.ano}: ${error}`);
                    falhas++;
                }

                processados++;
            }
        }

        console.log(`\n📈 RESUMO ICEC: ${processados} períodos processados | ✅ ${sucessos} sucessos | ❌ ${falhas} falhas`);
    }

    public async testSinglePeriod(mes: number, ano: number, regiao: string = 'BR'): Promise<void> {
        try {
            console.log(`📊 Testando ICEC ${regiao} ${mes.toString().padStart(2, '0')}/${ano}`);

            const filePath = await this.downloadFile(mes, ano, regiao);
            const data = await this.extractDataFromExcel(filePath, mes, ano, regiao);
            
            console.log('📈 Dados extraídos:', data);
            
            await this.saveToDatabase(data);
            await this.cleanupTempFile(filePath);

            console.log(`✅ ICEC ${regiao} ${mes.toString().padStart(2, '0')}/${ano} processado com sucesso`);

        } catch (error) {
            console.log(`❌ Erro ao processar ICEC ${regiao} ${mes.toString().padStart(2, '0')}/${ano}: ${error}`);
            throw error;
        }
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
        return `${this.baseUrl}/${mes}_${ano}/ICEC/${regiao}.xls`;
    }

    private async downloadFile(mes: number, ano: number, regiao: string = 'BR'): Promise<string> {
        try {
            const url = this.buildUrl(mes, ano, regiao);
            const response = await axios.get(url, { responseType: 'stream' });

            const tempDir = path.join(process.cwd(), 'temp');
            await fs.ensureDir(tempDir);

            const filePath = path.join(tempDir, `icec_${regiao}_${mes}_${ano}.xls`);
            const writer = fs.createWriteStream(filePath);

            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', () => resolve(filePath));
                writer.on('error', reject);
            });
        } catch (error) {
            throw new Error(`Erro ao baixar arquivo ICEC: ${error}`);
        }
    }

    private async extractDataFromExcel(filePath: string, mes: number, ano: number, regiao: string = 'BR'): Promise<Icec> {
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

            // Extrair valores numéricos (colunas 1-6: Total, Até 50, Mais de 50, Semiduráveis, Não duráveis, Duráveis)
            const numericData = icecRow.slice(1, 7).map(val => {
                const num = parseFloat(String(val || '0').replace(',', '.'));
                return isNaN(num) ? 0 : num;
            });

            return {
                ICEC: numericData[0],
                ATÉ_50: numericData[1],
                MAIS_DE_50: numericData[2],
                SEMIDURAVEIS: numericData[3],
                NAO_DURAVEIS: numericData[4],
                DURAVEIS: numericData[5],
                MES: mes,
                ANO: ano,
                REGIAO: regiao as Regiao
            };
        } catch (error) {
            throw new Error(`Erro ao processar arquivo ICEC: ${error}`);
        }
    }

    private async saveToDatabase(data: Icec): Promise<void> {
        try {
            const icecEntity = new Icec();
            icecEntity.ICEC = data.ICEC;
            icecEntity.ATÉ_50 = data.ATÉ_50;
            icecEntity.MAIS_DE_50 = data.MAIS_DE_50;
            icecEntity.SEMIDURAVEIS = data.SEMIDURAVEIS;
            icecEntity.NAO_DURAVEIS = data.NAO_DURAVEIS;
            icecEntity.DURAVEIS = data.DURAVEIS;
            icecEntity.MES = data.MES;
            icecEntity.ANO = data.ANO;
            icecEntity.REGIAO = data.REGIAO;

            await icecRepository.save(icecEntity);
        } catch (error) {
            throw new Error(`Erro ao salvar ICEC no banco: ${error}`);
        }
    }

    private async cleanupTempFile(filePath: string): Promise<void> {
        try {
            await fs.remove(filePath);
        } catch (error) {
            // Ignora erro de limpeza
        }
    }
}
