import * as dotenv from 'dotenv';
import { 
    parsePeriodConfig, 
    generateServicePeriods, 
    generatePeriodsFromConfig,
    getServicePeriodConfig,
    IPeriodConfig 
} from '../shared/utils';

// Carregar variáveis de ambiente
dotenv.config();

/**
 * Teste das novas funcionalidades de configuração de período
 */
async function testPeriodConfiguration() {
    console.log('🧪 Testando configuração de períodos\n');

    try {
        // Teste 1: Parsing de diferentes formatos
        console.log('=== Teste 1: Parsing de diferentes formatos ===');
        
        const testCases = [
            '01/2010:>',
            '01/2010:-1M', 
            '01/2010:-6M',
            '01/2010:12/2024',
            '03/2020:08/2025'
        ];

        for (const testCase of testCases) {
            try {
                const config = parsePeriodConfig(testCase);
                console.log(`✅ ${testCase}:`);
                console.log(`   Início: ${config.startDate.mes.toString().padStart(2, '0')}/${config.startDate.ano}`);
                console.log(`   Fim: ${config.endDate.mes.toString().padStart(2, '0')}/${config.endDate.ano}\n`);
            } catch (error) {
                console.log(`❌ ${testCase}: ${error}\n`);
            }
        }

        // Teste 2: Configurações dos serviços do .env
        console.log('=== Teste 2: Configurações dos serviços do .env ===');
        
        const services: Array<'ICF' | 'ICEC' | 'PEIC'> = ['ICF', 'ICEC', 'PEIC'];
        
        for (const service of services) {
            try {
                const config = getServicePeriodConfig(service);
                const periods = generateServicePeriods(service);
                
                console.log(`✅ ${service}:`);
                console.log(`   Configuração do .env: ${process.env[`PERIOD_${service}`] || 'não definida'}`);
                console.log(`   Início: ${config.startDate.mes.toString().padStart(2, '0')}/${config.startDate.ano}`);
                console.log(`   Fim: ${config.endDate.mes.toString().padStart(2, '0')}/${config.endDate.ano}`);
                console.log(`   Total de períodos: ${periods.length}`);
                console.log(`   Primeiro período: ${periods[0]?.mes.toString().padStart(2, '0')}/${periods[0]?.ano}`);
                console.log(`   Último período: ${periods[periods.length - 1]?.mes.toString().padStart(2, '0')}/${periods[periods.length - 1]?.ano}\n`);
            } catch (error) {
                console.log(`❌ Erro no ${service}: ${error}\n`);
            }
        }

        // Teste 3: Casos de erro
        console.log('=== Teste 3: Casos de erro ===');
        
        const errorCases = [
            'formato-invalido',
            '13/2010:>',  // mês inválido
            '01/1999:>',  // ano muito antigo
            '01/2010:13/2025', // mês final inválido
            '01/2010:-XM', // formato de subtração inválido
            '12/2025:01/2020' // data inicial posterior à final
        ];

        for (const errorCase of errorCases) {
            try {
                const config = parsePeriodConfig(errorCase);
                // Se chegou aqui, tentar gerar períodos para validar data inicial vs final
                generatePeriodsFromConfig(config);
                console.log(`⚠️ ${errorCase}: deveria ter dado erro mas funcionou!`);
            } catch (error) {
                console.log(`✅ ${errorCase}: erro capturado corretamente - ${error}`);
            }
        }

        // Teste 4: Fallback para configuração padrão
        console.log('\n=== Teste 4: Fallback para configuração padrão ===');
        
        const defaultConfig = parsePeriodConfig();
        console.log(`✅ Configuração padrão:`);
        console.log(`   Início: ${defaultConfig.startDate.mes.toString().padStart(2, '0')}/${defaultConfig.startDate.ano}`);
        console.log(`   Fim: ${defaultConfig.endDate.mes.toString().padStart(2, '0')}/${defaultConfig.endDate.ano}`);

    } catch (error) {
        console.error('❌ Erro durante os testes:', error);
    }
}

// Executar testes
if (require.main === module) {
    testPeriodConfiguration();
}
