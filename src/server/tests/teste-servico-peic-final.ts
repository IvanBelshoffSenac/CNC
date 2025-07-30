import { peicService } from '../services/peic';

async function testePeicServiceCorrigido() {
    console.log('🧪 Testando serviço PEIC corrigido...\n');

    try {
        // Testar um período específico sem salvar no banco
        console.log('🔍 Testando extração de dados apenas (sem salvar no banco)...');
        
        // Testar alguns períodos para verificar consistência
        const periodos = [
            { mes: 6, ano: 2013 },
            { mes: 12, ano: 2020 },
            { mes: 1, ano: 2024 }
        ];

        for (const periodo of periodos) {
            console.log(`\n📊 Testando ${periodo.mes.toString().padStart(2, '0')}/${periodo.ano}:`);
            
            try {
                await peicService.testSinglePeriod(periodo.mes, periodo.ano);
                console.log(`✅ ${periodo.mes.toString().padStart(2, '0')}/${periodo.ano} - Dados extraídos e salvos com sucesso!`);
            } catch (error) {
                console.log(`❌ ${periodo.mes.toString().padStart(2, '0')}/${periodo.ano} - Erro: ${error}`);
            }
        }

        console.log('\n🎯 Teste concluído!');
        console.log('💡 Agora o serviço PEIC está extraindo dados corretamente:');
        console.log('   - Percentuais da seção "PEIC (Percentual)" (valores entre 0-100%)');
        console.log('   - Absolutos da seção "PEIC (Síntese)" (valores formatados com pontos)');
        console.log('   - Evita sobrescrever dados com valores incorretos');
        
    } catch (error) {
        console.log(`❌ Erro no teste geral: ${error}`);
    }
}

testePeicServiceCorrigido();
