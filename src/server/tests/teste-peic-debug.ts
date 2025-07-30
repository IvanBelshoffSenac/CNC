import axios from 'axios';
import * as XLSX from 'xlsx';
import * as fs from 'fs-extra';
import * as path from 'path';
import { Peic } from '../database/entities/Peic';

interface PeicExtractedData {
    ENDIVIDADOS_PERCENTUAL: number;
    CONTAS_EM_ATRASO_PERCENTUAL: number;
    NÃO_TERAO_CONDICOES_DE_PAGAR_PERCENTUAL: number;
    ENDIVIDADOS_ABSOLUTO: string;
    CONTAS_EM_ATRASO_ABSOLUTO: string;
    NAO_TERÃO_CONDICOES_DE_PAGAR_ABSOLUTO: string;
    MES: number;
    ANO: number;
}

class PeicTestService {
    private baseUrl = process.env.BASE_URL || 'https://backend.pesquisascnc.com.br/admin/4/upload';

    public async testPeicExtraction(): Promise<void> {
        console.log('🔍 Iniciando teste de extração PEIC...\n');

        // Testar alguns períodos específicos
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
            console.log(`📁 Arquivo baixado: ${filePath}`);

            // Primeiro, vamos analisar a estrutura da planilha
            await this.analyzeExcelStructure(filePath);

            // Depois extrair os dados
            const data = await this.extractDataFromExcel(filePath, mes, ano);
            
            console.log('\n📈 Dados extraídos:');
            console.log('PERCENTUAIS:');
            console.log(`  Famílias endividadas: ${data.ENDIVIDADOS_PERCENTUAL}%`);
            console.log(`  Famílias com conta em atraso: ${data.CONTAS_EM_ATRASO_PERCENTUAL}%`);
            console.log(`  Famílias que não terão condições de pagar: ${data.NÃO_TERAO_CONDICOES_DE_PAGAR_PERCENTUAL}%`);
            
            console.log('\nABSOLUTOS:');
            console.log(`  Famílias endividadas: ${data.ENDIVIDADOS_ABSOLUTO}`);
            console.log(`  Famílias com conta em atraso: ${data.CONTAS_EM_ATRASO_ABSOLUTO}`);
            console.log(`  Famílias que não terão condições de pagar: ${data.NAO_TERÃO_CONDICOES_DE_PAGAR_ABSOLUTO}`);
            
            await this.cleanupTempFile(filePath);

        } catch (error) {
            console.log(`❌ Erro ao processar período ${mes.toString().padStart(2, '0')}/${ano}: ${error}`);
            throw error;
        }
    }

    private async analyzeExcelStructure(filePath: string): Promise<void> {
        try {
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null }) as any[][];

            console.log('\n🔍 Analisando estrutura da planilha...');
            console.log(`Número de linhas: ${jsonData.length}`);

            // Procurar por linhas que contenham as seções PEIC
            for (let i = 0; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (row && row[0]) {
                    const cellText = String(row[0]).toLowerCase();
                    
                    // Buscar seções importantes
                    if (cellText.includes('peic') && cellText.includes('percentual')) {
                        console.log(`\n📋 Seção PEIC (Percentual) encontrada na linha ${i + 1}:`);
                        // Mostrar as próximas 5 linhas
                        for (let j = i; j < Math.min(i + 5, jsonData.length); j++) {
                            console.log(`  Linha ${j + 1}: ${JSON.stringify(jsonData[j])}`);
                        }
                    }
                    
                    if (cellText.includes('peic') && cellText.includes('sintese')) {
                        console.log(`\n📋 Seção PEIC (Síntese) encontrada na linha ${i + 1}:`);
                        // Mostrar as próximas 5 linhas
                        for (let j = i; j < Math.min(i + 5, jsonData.length); j++) {
                            console.log(`  Linha ${j + 1}: ${JSON.stringify(jsonData[j])}`);
                        }
                    }

                    // Buscar linhas específicas dos dados
                    if (cellText.includes('famílias endividadas') && !cellText.includes('atraso') && !cellText.includes('condições')) {
                        console.log(`\n👥 "Famílias endividadas" na linha ${i + 1}: ${JSON.stringify(row)}`);
                    }
                    
                    if (cellText.includes('famílias com conta em atraso')) {
                        console.log(`\n⏰ "Famílias com conta em atraso" na linha ${i + 1}: ${JSON.stringify(row)}`);
                    }
                    
                    if (cellText.includes('famílias que não terão condições de pagar')) {
                        console.log(`\n❌ "Famílias que não terão condições" na linha ${i + 1}: ${JSON.stringify(row)}`);
                    }
                }
            }
        } catch (error) {
            console.log(`❌ Erro ao analisar estrutura: ${error}`);
        }
    }

    private buildUrl(mes: number, ano: number): string {
        return `${this.baseUrl}/${mes}_${ano}/PEIC/BR.xls`;
    }

    private async downloadFile(mes: number, ano: number): Promise<string> {
        try {
            const url = this.buildUrl(mes, ano);
            console.log(`🌐 Baixando de: ${url}`);
            
            const response = await axios.get(url, { responseType: 'stream' });

            const tempDir = path.join(process.cwd(), 'temp');
            await fs.ensureDir(tempDir);

            const filePath = path.join(tempDir, `peic_test_${mes}_${ano}.xls`);
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

    private async extractDataFromExcel(filePath: string, mes: number, ano: number): Promise<PeicExtractedData> {
        try {
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null }) as any[][];

            const peicData: Partial<PeicExtractedData> = {
                MES: mes,
                ANO: ano
            };

            // Extrair dados das seções PEIC específicas
            this.extractPeicPercentualData(jsonData, peicData);
            this.extractPeicSinteseData(jsonData, peicData);

            // Verificar se todos os campos obrigatórios foram preenchidos
            if (!this.isValidPeicData(peicData)) {
                console.log('❌ Dados PEIC incompletos extraídos do arquivo');
                console.log('Dados extraídos:', peicData);
                throw new Error('Dados PEIC incompletos extraídos do arquivo');
            }

            return peicData as PeicExtractedData;
        } catch (error) {
            throw new Error(`Erro ao processar arquivo PEIC: ${error}`);
        }
    }

    private extractPeicPercentualData(jsonData: any[][], peicData: Partial<PeicExtractedData>): void {
        console.log('\n🔍 Buscando seção PEIC (Percentual)...');
        
        let foundPercentualSection = false;
        
        for (let i = 0; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (row && row[0]) {
                const cellText = String(row[0]).toLowerCase();
                
                // Identificar a seção PEIC (Percentual)
                if (cellText.includes('peic') && cellText.includes('percentual')) {
                    foundPercentualSection = true;
                    console.log(`✅ Seção PEIC (Percentual) encontrada na linha ${i + 1}`);
                    
                    // Processar as próximas linhas desta seção
                    for (let j = i + 1; j < Math.min(i + 10, jsonData.length); j++) {
                        const dataRow = jsonData[j];
                        if (dataRow && dataRow[0]) {
                            const dataText = String(dataRow[0]).toLowerCase();
                            
                            if (dataText.includes('famílias endividadas') && 
                                !dataText.includes('atraso') && 
                                !dataText.includes('condições') &&
                                dataRow[1] !== null && dataRow[1] !== undefined) {
                                const value = this.parsePercentual(dataRow[1]);
                                peicData.ENDIVIDADOS_PERCENTUAL = value;
                                console.log(`  📊 Famílias endividadas: ${value}% (linha ${j + 1})`);
                            }
                            else if (dataText.includes('famílias com conta em atraso') && 
                                     !dataText.includes('condições') &&
                                     dataRow[1] !== null && dataRow[1] !== undefined) {
                                const value = this.parsePercentual(dataRow[1]);
                                peicData.CONTAS_EM_ATRASO_PERCENTUAL = value;
                                console.log(`  ⏰ Famílias com conta em atraso: ${value}% (linha ${j + 1})`);
                            }
                            else if (dataText.includes('famílias que não terão condições de pagar') &&
                                     dataRow[1] !== null && dataRow[1] !== undefined) {
                                const value = this.parsePercentual(dataRow[1]);
                                peicData.NÃO_TERAO_CONDICOES_DE_PAGAR_PERCENTUAL = value;
                                console.log(`  ❌ Famílias que não terão condições: ${value}% (linha ${j + 1})`);
                            }
                        }
                    }
                    break;
                }
            }
        }
        
        if (!foundPercentualSection) {
            console.log('⚠️ Seção PEIC (Percentual) não encontrada');
        }
    }

    private extractPeicSinteseData(jsonData: any[][], peicData: Partial<PeicExtractedData>): void {
        console.log('\n🔍 Buscando seção PEIC (Síntese)...');
        
        let foundSinteseSection = false;
        
        for (let i = 0; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (row && row[0]) {
                const cellText = String(row[0]).toLowerCase();
                
                // Identificar a seção PEIC (Síntese)
                if (cellText.includes('peic') && cellText.includes('sintese')) {
                    foundSinteseSection = true;
                    console.log(`✅ Seção PEIC (Síntese) encontrada na linha ${i + 1}`);
                    
                    // Processar as próximas linhas desta seção
                    for (let j = i + 1; j < Math.min(i + 10, jsonData.length); j++) {
                        const dataRow = jsonData[j];
                        if (dataRow && dataRow[0] && dataRow[1] !== null && dataRow[1] !== undefined) {
                            const dataText = String(dataRow[0]).toLowerCase();
                            
                            if (dataText.includes('famílias endividadas') && 
                                !dataText.includes('atraso') && 
                                !dataText.includes('condições')) {
                                const value = this.parseAbsoluto(dataRow[1]);
                                peicData.ENDIVIDADOS_ABSOLUTO = value;
                                console.log(`  📊 Famílias endividadas (absoluto): ${value} (linha ${j + 1})`);
                            }
                            else if (dataText.includes('famílias com conta em atraso') && 
                                     !dataText.includes('condições')) {
                                const value = this.parseAbsoluto(dataRow[1]);
                                peicData.CONTAS_EM_ATRASO_ABSOLUTO = value;
                                console.log(`  ⏰ Famílias com conta em atraso (absoluto): ${value} (linha ${j + 1})`);
                            }
                            else if (dataText.includes('famílias que não terão condições de pagar')) {
                                const value = this.parseAbsoluto(dataRow[1]);
                                peicData.NAO_TERÃO_CONDICOES_DE_PAGAR_ABSOLUTO = value;
                                console.log(`  ❌ Famílias que não terão condições (absoluto): ${value} (linha ${j + 1})`);
                            }
                        }
                    }
                    break;
                }
            }
        }
        
        if (!foundSinteseSection) {
            console.log('⚠️ Seção PEIC (Síntese) não encontrada');
        }
    }

    private parsePercentual(value: any): number {
        console.log(`    🔄 Convertendo percentual: ${value} (tipo: ${typeof value})`);
        
        if (typeof value === 'number') {
            // Se o valor já é um número, verificar se está em formato decimal ou percentual
            const result = value > 1 ? value : value * 100;
            console.log(`    ✅ Resultado: ${result}%`);
            return result;
        }
        
        if (typeof value === 'string') {
            // Remover símbolos e converter
            const cleanValue = value.replace(/[%,\s]/g, '').replace(',', '.');
            const num = parseFloat(cleanValue);
            
            if (isNaN(num)) {
                console.log(`    ❌ Valor inválido, retornando 0`);
                return 0;
            }
            
            const result = num > 1 ? num : num * 100;
            console.log(`    ✅ Resultado: ${result}%`);
            return result;
        }
        
        console.log(`    ❌ Tipo não suportado, retornando 0`);
        return 0;
    }

    private parseAbsoluto(value: any): string {
        console.log(`    🔄 Convertendo absoluto: ${value} (tipo: ${typeof value})`);
        
        if (typeof value === 'number') {
            // Formatar número para string com separadores brasileiros
            const result = Math.round(value).toLocaleString('pt-BR');
            console.log(`    ✅ Resultado: ${result}`);
            return result;
        }
        
        if (typeof value === 'string') {
            // Tentar converter string para número e depois formatar
            const cleanValue = value.replace(/[^\d.,]/g, '').replace(',', '.');
            const num = parseFloat(cleanValue);
            
            if (!isNaN(num)) {
                const result = Math.round(num).toLocaleString('pt-BR');
                console.log(`    ✅ Resultado: ${result}`);
                return result;
            }
        }
        
        const result = String(value);
        console.log(`    ✅ Resultado: ${result}`);
        return result;
    }

    private isValidPeicData(data: Partial<PeicExtractedData>): data is PeicExtractedData {
        const valid = (
            typeof data.ENDIVIDADOS_PERCENTUAL === 'number' &&
            typeof data.CONTAS_EM_ATRASO_PERCENTUAL === 'number' &&
            typeof data.NÃO_TERAO_CONDICOES_DE_PAGAR_PERCENTUAL === 'number' &&
            typeof data.ENDIVIDADOS_ABSOLUTO === 'string' &&
            typeof data.CONTAS_EM_ATRASO_ABSOLUTO === 'string' &&
            typeof data.NAO_TERÃO_CONDICOES_DE_PAGAR_ABSOLUTO === 'string' &&
            typeof data.MES === 'number' &&
            typeof data.ANO === 'number'
        );
        
        console.log(`\n✅ Validação dos dados: ${valid ? 'VÁLIDO' : 'INVÁLIDO'}`);
        if (!valid) {
            console.log('Campos faltantes ou inválidos:');
            console.log(`  ENDIVIDADOS_PERCENTUAL: ${typeof data.ENDIVIDADOS_PERCENTUAL} (esperado: number)`);
            console.log(`  CONTAS_EM_ATRASO_PERCENTUAL: ${typeof data.CONTAS_EM_ATRASO_PERCENTUAL} (esperado: number)`);
            console.log(`  NÃO_TERAO_CONDICOES_DE_PAGAR_PERCENTUAL: ${typeof data.NÃO_TERAO_CONDICOES_DE_PAGAR_PERCENTUAL} (esperado: number)`);
            console.log(`  ENDIVIDADOS_ABSOLUTO: ${typeof data.ENDIVIDADOS_ABSOLUTO} (esperado: string)`);
            console.log(`  CONTAS_EM_ATRASO_ABSOLUTO: ${typeof data.CONTAS_EM_ATRASO_ABSOLUTO} (esperado: string)`);
            console.log(`  NAO_TERÃO_CONDICOES_DE_PAGAR_ABSOLUTO: ${typeof data.NAO_TERÃO_CONDICOES_DE_PAGAR_ABSOLUTO} (esperado: string)`);
        }
        
        return valid;
    }

    private async cleanupTempFile(filePath: string): Promise<void> {
        try {
            await fs.remove(filePath);
            console.log(`🗑️ Arquivo temporário removido: ${filePath}`);
        } catch (error) {
            console.log(`⚠️ Erro ao remover arquivo temporário: ${error}`);
        }
    }
}

// Executar o teste
const testService = new PeicTestService();
testService.testPeicExtraction()
    .then(() => {
        console.log('\n🎉 Teste concluído!');
        process.exit(0);
    })
    .catch((error) => {
        console.log(`\n💥 Erro no teste: ${error}`);
        process.exit(1);
    });
