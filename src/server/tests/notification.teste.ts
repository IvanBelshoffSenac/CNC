import * as nodemailer from 'nodemailer';
import * as dotenv from 'dotenv';

dotenv.config();

const DeliveryMailPassword = async (): Promise<void | Error> => {
    console.log('🚀 Iniciando processo de envio de email...');

    // Debug das variáveis de ambiente
    console.log('📧 Configurações do email:');
    console.log('  - Host:', process.env.EXCHANGE_HOST);
    console.log('  - Port:', process.env.EXCHANGE_PORT);
    console.log('  - Username:', process.env.MAIL_USERNAME);
    console.log('  - Password:', process.env.MAIL_PASSWORD ? '***[DEFINIDA]***' : '❌ NÃO DEFINIDA');

    const port = process.env.EXCHANGE_PORT as unknown as number;
    console.log('🔧 Porta convertida para número:', port);

    console.log('⚙️ Criando transporter...');
    const transporter = nodemailer.createTransport({
        host: process.env.EXCHANGE_HOST,
        port: 587,
        //secure: false, // STARTTLS (não SMTPS)
        auth: {
            user: process.env.MAIL_USERNAME,
            pass: process.env.MAIL_PASSWORD
        },
        tls: {
            rejectUnauthorized: false
        }
    });

    console.log('✅ Transporter criado com sucesso');

    try {
        console.log('🔍 Verificando conexão com o servidor SMTP...');

        transporter.verify((error, success) => {
            if (error) {
                console.error('❌ Erro na verificação do SMTP:', error);
                console.error('📋 Detalhes do erro:');
                console.error('  - Código:', (error as any).code);
                console.error('  - Comando:', (error as any).command);
                console.error('  - Resposta:', (error as any).response);
                console.error('  - Stack:', error.stack);
                return new Error('Erro interno do servidor');
            } else if (success) {
                console.log('✅ Conexão SMTP verificada com sucesso!');

                console.log('📨 Preparando para enviar email...');
                const mailOptions = {
                    from: process.env.MAIL_USERNAME,
                    to: 'ivan.belshoff@es.senac.br',
                    subject: 'E-mail de Teste',
                    html: `
                        <!DOCTYPE html>
            <html lang="pt-br" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
            
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width,initial-scale=1">
              <meta name="x-apple-disable-message-reformatting">
              <title>Teste</title>
            </head>
            
            <body style="margin:0;padding:0;word-spacing:normal;background-color:#FFF;">
              <h1>Teste</h1>
            </body>
            
            </html>       
                    `
                };

                console.log('📧 Dados do email:');
                console.log('  - De:', mailOptions.from);
                console.log('  - Para:', mailOptions.to);
                console.log('  - Assunto:', mailOptions.subject);
                console.log('  - Tamanho do HTML:', mailOptions.html.length, 'caracteres');

                console.log('📤 Enviando email...');
                transporter.sendMail(mailOptions, (sendError, info) => {
                    if (sendError) {
                        console.error('❌ Erro ao enviar email:', sendError);
                        console.error('📋 Detalhes do erro de envio:');
                        console.error('  - Código:', (sendError as any).code);
                        console.error('  - Comando:', (sendError as any).command);
                        console.error('  - Resposta:', (sendError as any).response);
                        console.error('  - Stack:', sendError.stack);
                        return new Error('Erro ao enviar o e-mail');
                    } else {
                        console.log('✅ Email enviado com sucesso!');
                        console.log('📨 Informações do envio:', info);
                        console.log('  - Message ID:', info.messageId);
                        console.log('  - Response:', info.response);
                        console.log('  - Accepted:', info.accepted);
                        console.log('  - Rejected:', info.rejected);
                    }
                });

                return;
            }
        });

    } catch (error) {
        console.error('💥 Erro geral capturado:', error);
        console.error('📋 Detalhes do erro geral:');
        console.error('  - Tipo:', typeof error);
        console.error('  - Mensagem:', (error as any).message);
        console.error('  - Stack:', (error as any).stack);
        return new Error('Erro ao enviar o e-mail');
    }
};

DeliveryMailPassword()