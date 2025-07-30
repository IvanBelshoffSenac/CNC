import axios from 'axios';
import * as XLSX from 'xlsx';
import * as fs from 'fs-extra';
import * as path from 'path';

interface PeicTestData {
    ENDIVIDADOS_PERCENTUAL: number;
    CONTAS_EM_ATRASO_PERCENTUAL: number;
    NÃO_TERAO_CONDICOES_DE_PAGAR_PERCENTUAL: number;
    ENDIVIDADOS_ABSOLUTO: string;
    CONTAS_EM_ATRASO_ABSOLUTO: string;
    NAO_TERÃO_CONDICOES_DE_PAGAR_ABSOLUTO: string;
    MES: number;
    ANO: number;
}

class PeicTestServiceFixed {
    private baseUrl = process.env.BASE_URL || 'https://backend.pesquisascnc.com.br/admin/4/upload';

    public async testFixedExtraction(): Promise<void> {
        console.log('🔧 Testando extração PEIC corrigida...\n');

        const testPeriods = [
            { mes: 6, ano: 2013 },
            { mes: 12, ano: 2020 },
            { mes: 1, ano: 2024 }
        ];

        for (const period of testPeriods) {
            try {
                console.log(`\n📊 Testando período: ${period.mes.toString().padStart(2, '0')}/${period.ano}`);
                await this.testSinglePeriod(period.mes, period.ano);
            } catch (error) {
                console.log(`❌ Erro no período ${period.mes.toString().padStart(2, '0')}/${period.ano}: ${error}`);
            }
        }
    }

    private async testSinglePeriod(mes: number, ano: number): Promise<void> {
        try {
            const filePath = await this.downloadFile(mes, ano);
            const data = await this.extractDataFromExcel(filePath, mes, ano);
            
            console.log('\n📊 DADOS EXTRAÍDOS:');
            console.log('=====================================');
            console.log('PERCENTUAIS (PEIC Percentual):');
            console.log(`  Famílias endividadas: ${data.ENDIVIDADOS_PERCENTUAL}%`);
            console.log(`  Famílias com conta em atraso: ${data.CONTAS_EM_ATRASO_PERCENTUAL}%`);
            console.log(`  Famílias que não terão condições: ${data.NÃO_TERAO_CONDICOES_DE_PAGAR_PERCENTUAL}%`);
            
            console.log('\nABSOLUTOS (PEIC Síntese):');
            console.log(`  Famílias endividadas: ${data.ENDIVIDADOS_ABSOLUTO}`);
            console.log(`  Famílias com conta em atraso: ${data.CONTAS_EM_ATRASO_ABSOLUTO}`);
            console.log(`  Famílias que não terão condições: ${data.NAO_TERÃO_CONDICOES_DE_PAGAR_ABSOLUTO}`);
            console.log('=====================================');
            
            // Validar se os dados estão corretos
            this.validateData(data);
            
            await this.cleanupTempFile(filePath);

        } catch (error) {
            console.log(`❌ Erro ao processar período ${mes.toString().padStart(2, '0')}/${ano}: ${error}`);
            throw error;
        }
    }

    private validateData(data: PeicTestData): void {
        console.log('\n🔍 Validando dados...');
        
        // Percentuais devem estar entre 0 e 100
        const percentuais = [
            { nome: 'Endividados', valor: data.ENDIVIDADOS_PERCENTUAL },
            { nome: 'Contas em atraso', valor: data.CONTAS_EM_ATRASO_PERCENTUAL },
            { nome: 'Sem condições de pagar', valor: data.NÃO_TERAO_CONDICOES_DE_PAGAR_PERCENTUAL }
        ];

        let valid = true;
        for (const item of percentuais) {
            if (item.valor < 0 || item.valor > 100) {
                console.log(`❌ ${item.nome}: ${item.valor}% (fora do range 0-100%)`);
                valid = false;
            } else {
                console.log(`✅ ${item.nome}: ${item.valor}% (válido)`);
            }
        }

        // Absolutos devem ser strings formatadas
        const absolutos = [
            { nome: 'Endividados', valor: data.ENDIVIDADOS_ABSOLUTO },
            { nome: 'Contas em atraso', valor: data.CONTAS_EM_ATRASO_ABSOLUTO },
            { nome: 'Sem condições de pagar', valor: data.NAO_TERÃO_CONDICOES_DE_PAGAR_ABSOLUTO }
        ];

        for (const item of absolutos) {
            if (item.valor && item.valor.includes('.')) {
                console.log(`✅ ${item.nome}: ${item.valor} (formato válido)`);
            } else {
                console.log(`❌ ${item.nome}: ${item.valor} (formato inválido)`);
                valid = false;
            }
        }

        console.log(`\n${valid ? '✅ Dados válidos!' : '❌ Dados inválidos!'}`);
    }

    private buildUrl(mes: number, ano: number): string {
        return `${this.baseUrl}/${mes}_${ano}/PEIC/BR.xls`;
    }

    private async downloadFile(mes: number, ano: number): Promise<string> {
        try {
            const url = this.buildUrl(mes, ano);
            const response = await axios.get(url, { responseType: 'stream' });

            const tempDir = path.join(process.cwd(), 'temp');
            await fs.ensureDir(tempDir);

            const filePath = path.join(tempDir, `peic_fixed_${mes}_${ano}.xls`);
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

    private async extractDataFromExcel(filePath: string, mes: number, ano: number): Promise<PeicTestData> {
        try {
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null }) as any[][];

            const peicData: Partial<PeicTestData> = {
                MES: mes,
                ANO: ano
            };

            // Extrair dados das seções específicas
            this.extractPercentualData(jsonData, peicData);
            this.extractAbsolutoData(jsonData, peicData);

            // Verificar se todos os campos foram preenchidos
            if (!this.isValidPeicData(peicData)) {
                throw new Error('Dados PEIC incompletos extraídos do arquivo');
            }

            return peicData as PeicTestData;
        } catch (error) {
            throw new Error(`Erro ao processar arquivo PEIC: ${error}`);
        }
    }

    private extractPercentualData(jsonData: any[][], peicData: Partial<PeicTestData>): void {
        console.log('\n🔍 Buscando seção PEIC (Percentual)...');
        
        for (let i = 0; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (row && row[0]) {
                const cellText = String(row[0]).toLowerCase();
                
                // Identificar a seção PEIC (Percentual)
                if (cellText.includes('peic') && cellText.includes('percentual')) {
                    console.log(`✅ Seção PEIC (Percentual) encontrada na linha ${i + 1}`);
                    
                    // Processar as próximas linhas desta seção
                    for (let j = i + 1; j < Math.min(i + 10, jsonData.length); j++) {
                        const dataRow = jsonData[j];
                        if (dataRow && dataRow[0] && dataRow[1] !== null && dataRow[1] !== undefined) {
                            const dataText = String(dataRow[0]).toLowerCase();
                            
                            // Verificar se é um valor decimal (percentual) - valores absolutos são maiores que 1000
                            if (typeof dataRow[1] === 'number' && dataRow[1] < 1) {
                                if (dataText.includes('famílias endividadas') && 
                                    !dataText.includes('atraso') && 
                                    !dataText.includes('condições') &&
                                    !peicData.ENDIVIDADOS_PERCENTUAL) {
                                    const value = this.parsePercentual(dataRow[1]);
                                    peicData.ENDIVIDADOS_PERCENTUAL = value;
                                    console.log(`  📊 Famílias endividadas: ${value}%`);
                                }
                                else if (dataText.includes('famílias com conta em atraso') && 
                                         !dataText.includes('condições') &&
                                         !peicData.CONTAS_EM_ATRASO_PERCENTUAL) {
                                    const value = this.parsePercentual(dataRow[1]);
                                    peicData.CONTAS_EM_ATRASO_PERCENTUAL = value;
                                    console.log(`  ⏰ Famílias com conta em atraso: ${value}%`);
                                }
                                else if (dataText.includes('famílias que não terão condições de pagar') &&
                                         !peicData.NÃO_TERAO_CONDICOES_DE_PAGAR_PERCENTUAL) {
                                    const value = this.parsePercentual(dataRow[1]);
                                    peicData.NÃO_TERAO_CONDICOES_DE_PAGAR_PERCENTUAL = value;
                                    console.log(`  ❌ Famílias que não terão condições: ${value}%`);
                                }
                            }
                        }
                    }
                    break;
                }
            }
        }
    }

    private extractAbsolutoData(jsonData: any[][], peicData: Partial<PeicTestData>): void {
        console.log('\n🔍 Buscando seção PEIC (Síntese)...');
        
        for (let i = 0; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (row && row[0]) {
                const cellText = String(row[0]).toLowerCase();
                
                // Identificar a seção PEIC (Síntese)
                if (cellText.includes('peic') && cellText.includes('sintese')) {
                    console.log(`✅ Seção PEIC (Síntese) encontrada na linha ${i + 1}`);
                    
                    // Processar as próximas linhas desta seção
                    for (let j = i + 1; j < Math.min(i + 10, jsonData.length); j++) {
                        const dataRow = jsonData[j];
                        if (dataRow && dataRow[0] && dataRow[1] !== null && dataRow[1] !== undefined) {
                            const dataText = String(dataRow[0]).toLowerCase();
                            
                            // Verificar se é um valor absoluto (números grandes) - valores absolutos são maiores que 1000
                            if (typeof dataRow[1] === 'number' && dataRow[1] > 1000) {
                                if (dataText.includes('famílias endividadas') && 
                                    !dataText.includes('atraso') && 
                                    !dataText.includes('condições') &&
                                    !peicData.ENDIVIDADOS_ABSOLUTO) {
                                    const value = this.parseAbsoluto(dataRow[1]);
                                    peicData.ENDIVIDADOS_ABSOLUTO = value;
                                    console.log(`  📊 Famílias endividadas: ${value}`);
                                }
                                else if (dataText.includes('famílias com conta em atraso') && 
                                         !dataText.includes('condições') &&
                                         !peicData.CONTAS_EM_ATRASO_ABSOLUTO) {
                                    const value = this.parseAbsoluto(dataRow[1]);
                                    peicData.CONTAS_EM_ATRASO_ABSOLUTO = value;
                                    console.log(`  ⏰ Famílias com conta em atraso: ${value}`);
                                }
                                else if (dataText.includes('famílias que não terão condições de pagar') &&
                                         !peicData.NAO_TERÃO_CONDICOES_DE_PAGAR_ABSOLUTO) {
                                    const value = this.parseAbsoluto(dataRow[1]);
                                    peicData.NAO_TERÃO_CONDICOES_DE_PAGAR_ABSOLUTO = value;
                                    console.log(`  ❌ Famílias que não terão condições: ${value}`);
                                }
                            }
                        }
                    }
                    break;
                }
            }
        }
    }

    private parsePercentual(value: any): number {
        if (typeof value === 'number') {
            // Converter valores decimais para porcentagem
            // Exemplo: 0.578 → 57.8%
            return value < 1 ? Math.round(value * 100 * 10) / 10 : value;
        }
        
        const strValue = String(value).replace(/[%,\s]/g, '').replace(',', '.');
        const num = parseFloat(strValue);
        
        if (isNaN(num)) {
            return 0;
        }
        
        return num < 1 ? Math.round(num * 100 * 10) / 10 : num;
    }

    private parseAbsoluto(value: any): string {
        if (typeof value === 'number') {
            return Math.round(value).toLocaleString('pt-BR');
        }
        
        if (typeof value === 'string') {
            const cleanValue = value.replace(/[^\d.,]/g, '').replace(',', '.');
            const num = parseFloat(cleanValue);
            
            if (!isNaN(num)) {
                return Math.round(num).toLocaleString('pt-BR');
            }
        }
        
        return String(value);
    }

    private isValidPeicData(data: Partial<PeicTestData>): data is PeicTestData {
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

    private async cleanupTempFile(filePath: string): Promise<void> {
        try {
            await fs.remove(filePath);
        } catch (error) {
            // Ignora erro de limpeza
        }
    }
}

// Executar teste
const testService = new PeicTestServiceFixed();
testService.testFixedExtraction()
    .then(() => {
        console.log('\n🎉 Teste concluído!');
        process.exit(0);
    })
    .catch((error) => {
        console.log(`\n💥 Erro no teste: ${error}`);
        process.exit(1);
    });
