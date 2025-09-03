import * as nodemailer from 'nodemailer';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as dotenv from 'dotenv';
import { addDays, addMonths, format, differenceInDays, setDate, setHours, setMinutes, setSeconds, isAfter, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { IServiceResult } from '../shared/interfaces';

dotenv.config();

export class NotificationService {
    private tempDir = path.join(process.cwd(), 'temp');

    constructor() {
        this.ensureTempDirectory();
    }

    /**
     * Calcula a próxima execução baseada no schedule CRON do serviço
     */
    private calcularProximaExecucao(nomeServico: string): { proximaData: Date; diasAteProxima: number; dataFormatada: string } {
        const agora = new Date();
        
        // Obter schedule do ambiente ou usar padrão
        const schedules = {
            'ICEC': process.env.SCHEDULE_ICEC || '0 2 1 * *',
            'ICF': process.env.SCHEDULE_ICF || '0 5 1 * *',
            'PEIC': process.env.SCHEDULE_PEIC || '0 8 1 * *'
        };

        const schedule = schedules[nomeServico as keyof typeof schedules];
        if (!schedule) {
            // Fallback para serviços não mapeados
            const proximaData = addDays(agora, 30);
            return {
                proximaData,
                diasAteProxima: 30,
                dataFormatada: format(proximaData, "dd/MM/yyyy", { locale: ptBR })
            };
        }

        // Parse do CRON schedule (formato: "segundo minuto hora dia mês dia_semana")
        const cronParts = schedule.split(' ');
        const [segundo, minuto, hora, dia, mes] = cronParts;

        let proximaData: Date;

        // Para schedules mensais (dia específico do mês)
        if (dia !== '*' && mes === '*') {
            const diaDoMes = parseInt(dia);
            const horaExecucao = parseInt(hora);
            const minutoExecucao = parseInt(minuto);

            // Calcular próxima execução para o dia específico do mês
            let proximoMes = agora;
            proximoMes = setDate(proximoMes, diaDoMes);
            proximoMes = setHours(proximoMes, horaExecucao);
            proximoMes = setMinutes(proximoMes, minutoExecucao);
            proximoMes = setSeconds(proximoMes, 0);

            // Se a data já passou este mês, ir para o próximo mês
            if (isAfter(agora, proximoMes)) {
                proximoMes = addMonths(proximoMes, 1);
                proximoMes = setDate(proximoMes, diaDoMes);
            }

            proximaData = proximoMes;
        } else {
            // Para outros tipos de schedule, assumir próximo mês
            proximaData = addMonths(agora, 1);
            proximaData = setDate(proximaData, 1);
            proximaData = setHours(proximaData, parseInt(hora || '2'));
            proximaData = setMinutes(proximaData, parseInt(minuto || '0'));
            proximaData = setSeconds(proximaData, 0);
        }

        const diasAteProxima = differenceInDays(startOfDay(proximaData), startOfDay(agora));
        const dataFormatada = format(proximaData, "dd/MM/yyyy", { locale: ptBR });

        return {
            proximaData,
            diasAteProxima,
            dataFormatada
        };
    }

    /**
     * Processa a lista de destinatários de email
     */
    private processarDestinatarios(): string {
        const emailsPadrão = 'ivan.belshoff@es.senac.br';
        
        // Verificar se existe a variável de ambiente
        const notificationEmails = process.env.NOTIFICATION_EMAIL;
        
        if (!notificationEmails || notificationEmails.trim() === '') {
            console.log('📧 Usando email padrão (variável NOTIFICATION_EMAIL não configurada)');
            return emailsPadrão;
        }

        // Processar múltiplos emails separados por vírgula
        const emails = notificationEmails
            .split(',')
            .map(email => email.trim())
            .filter(email => email.length > 0 && this.validarEmail(email));

        if (emails.length === 0) {
            console.log('📧 Nenhum email válido encontrado, usando email padrão');
            return emailsPadrão;
        }

        const emailsList = emails.join(', ');
        console.log(`📧 Destinatários configurados: ${emailsList}`);
        return emailsList;
    }

    /**
     * Valida formato básico de email
     */
    private validarEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    private async ensureTempDirectory(): Promise<void> {
        try {
            await fs.ensureDir(this.tempDir);
        } catch (error) {
            console.error('❌ Erro ao criar diretório temporário:', error);
        }
    }

    /**
     * Envia relatório completo do processamento por e-mail
     */
    public async enviarRelatorioCompleto(resultados: IServiceResult[], modoExecucao: 'Agendado' | 'Forçado' = 'Agendado'): Promise<void> {
        console.log('📧 Iniciando envio de relatório de monitoramento...');

        try {
            // Marcar o modo de execução em cada resultado
            resultados.forEach(resultado => {
                resultado.modoExecucao = modoExecucao;
            });

            // Gerar planilhas para cada serviço
            const anexos = await this.gerarPlanilhas(resultados);

            // Gerar corpo do e-mail
            const corpoEmail = this.gerarCorpoEmail(resultados, modoExecucao);

            // Enviar e-mail
            await this.enviarEmail(corpoEmail, anexos, modoExecucao);

            // Limpar arquivos temporários
            await this.limparArquivosTemporarios(anexos);

            console.log('✅ Relatório de monitoramento enviado com sucesso!');

        } catch (error) {
            console.error('❌ Erro ao enviar relatório de monitoramento:', error);
            throw error;
        }
    }

    /**
     * Gera planilhas Excel para cada serviço
     */
    private async gerarPlanilhas(resultados: IServiceResult[]): Promise<string[]> {
        const arquivos: string[] = [];

        for (const resultado of resultados) {
            const nomeArquivo = `relatorio_${resultado.servico.toLowerCase()}_${new Date().toISOString().split('T')[0]}.xlsx`;
            const caminhoArquivo = path.join(this.tempDir, nomeArquivo);

            // Preparar dados para a planilha
            const dadosTabela = resultado.tasks.map(task => ({
                'Mês': task.mes.toString().padStart(2, '0'),
                'Ano': task.ano,
                'Região': task.regiao,
                'Status': task.status,
                'Método': task.metodo,
                'Erro': task.erro || ''
            }));

            // Criar workbook
            const workbook = XLSX.utils.book_new();
            
            // Adicionar aba com dados detalhados
            const worksheet = XLSX.utils.json_to_sheet(dadosTabela);
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Detalhes');

            // Adicionar aba com resumo
            const resumo = [{
                'Serviço': resultado.servico,
                'Período Início': resultado.periodoInicio,
                'Período Fim': resultado.periodoFim,
                'Tempo Execução (min)': Math.round(resultado.tempoExecucao / 60),
                'Total Registros': resultado.totalRegistros,
                'Registros Planilha': resultado.registrosPlanilha,
                'Registros Web Scraping': resultado.registrosWebScraping,
                'Sucessos': resultado.sucessos,
                'Falhas': resultado.falhas,
                'Taxa Sucesso (%)': Math.round((resultado.sucessos / resultado.tasks.length) * 100)
            }];

            const worksheetResumo = XLSX.utils.json_to_sheet(resumo);
            XLSX.utils.book_append_sheet(workbook, worksheetResumo, 'Resumo');

            // Salvar arquivo
            XLSX.writeFile(workbook, caminhoArquivo);
            arquivos.push(caminhoArquivo);

            console.log(`📊 Planilha gerada: ${nomeArquivo}`);
        }

        return arquivos;
    }

    /**
     * Gera o corpo do e-mail com resumo detalhado
     */
    private gerarCorpoEmail(resultados: IServiceResult[], modoExecucao: 'Agendado' | 'Forçado' = 'Agendado'): string {
        const dataExecucao = new Date().toLocaleString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const tempoTotalExecucao = resultados.reduce((total, r) => total + r.tempoExecucao, 0);
        const totalRegistrosGeral = resultados.reduce((total, r) => total + r.totalRegistros, 0);
        const totalSucessosGeral = resultados.reduce((total, r) => total + r.sucessos, 0);
        const totalFalhasGeral = resultados.reduce((total, r) => total + r.falhas, 0);
        const totalTasksGeral = resultados.reduce((total, r) => total + r.tasks.length, 0);

        // Consolidar todas as regiões distintas processadas entre todos os serviços
        const todasRegioes = new Set<string>();
        resultados.forEach(resultado => {
            resultado.tasks.forEach(task => {
                todasRegioes.add(task.regiao);
            });
        });
        const regioesConsolidadas = Array.from(todasRegioes).sort().join(', ');

        let corpoEmail = `
        <!DOCTYPE html>
        <html lang="pt-br">
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <title>Relatório de Monitoramento - CNC</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
                .header { background-color: #2c3e50; color: white; padding: 20px; border-radius: 8px; text-align: center; }
                .summary { background-color: #ecf0f1; padding: 15px; margin: 20px 0; border-radius: 8px; }
                .service-section { margin: 20px 0; padding: 15px; border: 1px solid #bdc3c7; border-radius: 8px; }
                .success { color: #27ae60; font-weight: bold; }
                .error { color: #e74c3c; font-weight: bold; }
                .stats { display: inline-block; margin: 10px 15px 10px 0; }
                .footer { background-color: #34495e; color: white; padding: 15px; border-radius: 8px; text-align: center; margin-top: 30px; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🎯 Relatório de Monitoramento CNC</h1>
                <p>Execução realizada em: <strong>${dataExecucao}</strong></p>
            </div>

            <div class="summary">
                <h2>📊 Resumo Geral</h2>
                <div class="stats">⏱️ <strong>Tempo Total:</strong> ${Math.round(tempoTotalExecucao / 60)} minutos</div>
                <div class="stats">📈 <strong>Total de Registros:</strong> ${totalRegistrosGeral}</div>
                <div class="stats">✅ <strong>Sucessos:</strong> ${totalSucessosGeral}</div>
                <div class="stats">❌ <strong>Falhas:</strong> ${totalFalhasGeral}</div>
                <div class="stats">🎯 <strong>Taxa de Sucesso:</strong> ${Math.round((totalSucessosGeral / totalTasksGeral) * 100)}%</div>
                <div class="stats">🌎 <strong>Regiões Apuradas:</strong> ${regioesConsolidadas}</div>
                <div class="stats">🔄 <strong>Modo de Execução:</strong> ${modoExecucao}</div>
            </div>
        `;

        // Adicionar seção para cada serviço
        for (const resultado of resultados) {
            const taxaSucesso = Math.round((resultado.sucessos / resultado.tasks.length) * 100);
            const statusClass = taxaSucesso >= 90 ? 'success' : taxaSucesso >= 70 ? 'warning' : 'error';

            // Extrair regiões únicas dos tasks
            const regioesApuradas = [...new Set(resultado.tasks.map(task => task.regiao))].sort();

            // Calcular próxima execução
            const { dataFormatada, diasAteProxima } = this.calcularProximaExecucao(resultado.servico);
            const textoProximaExecucao = diasAteProxima === 0 
                ? 'hoje' 
                : diasAteProxima === 1 
                    ? 'amanhã' 
                    : `${diasAteProxima} dias`;

            corpoEmail += `
            <div class="service-section">
                <h3>📋 ${resultado.servico}</h3>
                <p><strong>Período:</strong> ${resultado.periodoInicio} → ${resultado.periodoFim}</p>
                <p><strong>Tempo de Execução:</strong> ${Math.round(resultado.tempoExecucao / 60)} minutos (${resultado.tempoExecucao} segundos)</p>
                <p><strong>Regiões Apuradas:</strong> ${regioesApuradas.join(', ')}</p>
                
                <div class="stats">📊 <strong>Total de Registros:</strong> ${resultado.totalRegistros}</div>
                <br>
                
                <div class="stats">✅ <strong>Sucessos:</strong> ${resultado.sucessos}</div>
                <div class="stats">📄 <strong>Por Planilha:</strong> ${resultado.registrosPlanilha}</div>
                <div class="stats">🌐 <strong>Por Web Scraping:</strong> ${resultado.registrosWebScraping}</div>
                <br>
                
                <div class="stats">❌ <strong>Falhas:</strong> ${resultado.falhas}</div>
                <br>
                
                <div class="stats ${statusClass}">🎯 <strong>Taxa de Sucesso:</strong> ${taxaSucesso}%</div>
                <br>
                
                <div class="stats">📅 <strong>Próxima Execução Agendada:</strong> ${dataFormatada} (${textoProximaExecucao})</div>
            </div>
            `;
        }

        corpoEmail += `
            <div class="footer">
                <p>🤖 <strong>Sistema de Monitoramento CNC</strong></p>
                <p>Relatórios detalhados em anexo • Dados históricos desde Janeiro/2010</p>
            </div>
        </body>
        </html>
        `;

        return corpoEmail;
    }

    /**
     * Envia o e-mail com anexos
     */
    private async enviarEmail(corpoEmail: string, anexos: string[], modoExecucao: 'Agendado' | 'Forçado' = 'Agendado'): Promise<void> {
        console.log('📤 Enviando e-mail de relatório...');

        const transporter = nodemailer.createTransport({
            host: process.env.EXCHANGE_HOST,
            port: 587,
            auth: {
                user: process.env.MAIL_USERNAME,
                pass: process.env.MAIL_PASSWORD
            },
            tls: {
                rejectUnauthorized: false
            }
        });

        // Preparar anexos
        const attachments = anexos.map(arquivo => ({
            filename: path.basename(arquivo),
            path: arquivo
        }));

        const iconeSubject = modoExecucao === 'Agendado' ? '⏰' : '🚀';
        const subject = `${iconeSubject} Relatório CNC ${modoExecucao} - ${new Date().toLocaleDateString('pt-BR')}`;

        // Processar destinatários
        const destinatarios = this.processarDestinatarios();

        const mailOptions = {
            from: process.env.MAIL_USERNAME,
            to: destinatarios,
            subject: subject,
            html: corpoEmail,
            attachments: attachments
        };

        return new Promise((resolve, reject) => {
            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.error('❌ Erro ao enviar e-mail:', error);
                    reject(error);
                } else {
                    console.log('✅ E-mail enviado com sucesso!');
                    console.log('📨 Message ID:', info.messageId);
                    resolve();
                }
            });
        });
    }

    /**
     * Remove arquivos temporários após envio
     */
    private async limparArquivosTemporarios(arquivos: string[]): Promise<void> {
        for (const arquivo of arquivos) {
            try {
                await fs.remove(arquivo);
                console.log(`🗑️ Arquivo temporário removido: ${path.basename(arquivo)}`);
            } catch (error) {
                console.warn(`⚠️ Não foi possível remover arquivo: ${arquivo}`);
            }
        }
    }

}

export const notificationService = new NotificationService();
