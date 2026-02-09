import { CronJob } from "cron";
import prismaClient from "../prisma";
import { StatusPagamento, StatusContrato } from "@prisma/client";
import { addDays, differenceInDays, isBefore } from "date-fns";
import fs from 'fs';
import path from 'path';
import { EmailService } from "../functions/emailService";
import { EmailTemplates } from "../functions/email-templates";
import { getDataAtualBrasil } from "../utils/dateUtils";

const emailService = new EmailService();

class CronService {

    constructor() {
        this.initJobs();
    }

    private initJobs() {
        new CronJob('0 0 * * *', async () => {
            console.log('[CRON] Iniciando rotinas diárias...');
            await this.verificarAtrasos();
            await this.aplicarMultas();
            await this.notificarVencimentos();
            await this.verificarFimDeContrato();
            await this.limparArquivosTemporarios();
            console.log('[CRON] Rotinas finalizadas.');
        }, null, true, 'America/Sao_Paulo');
    }

    async verificarAtrasos() {
        const hoje = getDataAtualBrasil();
        await prismaClient.fatura.updateMany({
            where: {
                status: StatusPagamento.PENDENTE,
                dataVencimento: { lt: hoje }
            },
            data: { status: StatusPagamento.ATRASADO }
        });
        console.log('[CRON] Status de faturas atualizados para ATRASADO.');
    }

    async aplicarMultas() {
        const hoje = getDataAtualBrasil();

        const faturasAtrasadas = await prismaClient.fatura.findMany({
            where: { status: StatusPagamento.ATRASADO }
        });

        for (const fatura of faturasAtrasadas) {
            const diasAtraso = differenceInDays(hoje, fatura.dataVencimento);

            if (diasAtraso > 0) {
                const valorBase = fatura.valorAluguel + fatura.valorEnergia;
                const multaFixa = valorBase * 0.02;
                const juros = valorBase * (0.00033 * diasAtraso);

                const novaMulta = parseFloat((multaFixa + juros).toFixed(2));

                if (fatura.valorMulta !== novaMulta) {
                    await prismaClient.fatura.update({
                        where: { id: fatura.id },
                        data: {
                            valorMulta: novaMulta,
                            valorTotal: valorBase + novaMulta + fatura.acrescimoAplicado - fatura.descontoAplicado
                        }
                    });
                }
            }
        }
        console.log(`[CRON] Multas atualizadas para ${faturasAtrasadas.length} faturas.`);
    }

    async notificarVencimentos() {
        const hoje = getDataAtualBrasil();
        const daqui3Dias = addDays(hoje, 3);

        const faturasParaAvisar = await prismaClient.fatura.findMany({
            where: {
                status: StatusPagamento.PENDENTE,
                dataVencimento: { in: [hoje, daqui3Dias] }
            },
            include: {
                contrato: { include: { cliente: { include: { user: true } } } }
            }
        });

        for (const fatura of faturasParaAvisar) {
            try {
                const cliente = fatura.contrato.cliente;
                await emailService.sendEmail({
                    to: cliente.user.email,
                    subject: `Lembrete: Fatura Vencendo - ${fatura.dataVencimento.toLocaleDateString('pt-BR')}`,
                    html: EmailTemplates.CLIENTE_VENCIMENTO_PROXIMO(
                        cliente.nome,
                        fatura.dataVencimento.toLocaleDateString('pt-BR'),
                        fatura.valorTotal,
                        `https://app.flatfersa.com.br/faturas/${fatura.id}`
                    )
                });
            } catch (error) {
                console.error(`Erro ao notificar fatura ${fatura.id}`);
            }
        }
    }

    async verificarFimDeContrato() {
        const hoje = getDataAtualBrasil();

        const contratosAtivos = await prismaClient.contrato.findMany({
            where: { status: StatusContrato.ATIVO }
        });

        for (const contrato of contratosAtivos) {
            const dataFim = addDays(new Date(contrato.dataInicio), contrato.duracaoMeses * 30);

            if (isBefore(dataFim, hoje)) {
                await emailService.sendEmail({
                    to: process.env.ADMIN_EMAIL as string,
                    subject: 'Alerta: Contrato Vencido',
                    html: `<p>O contrato do cliente <strong>${contrato.clienteId}</strong> chegou ao fim do prazo.</p>`
                });
            }
        }
    }

    async limparArquivosTemporarios() {
        const directory = path.join(__dirname, '../../tmp');
        if (!fs.existsSync(directory)) return;

        fs.readdir(directory, (err, files) => {
            if (err) return;
            for (const file of files) {
                const filePath = path.join(directory, file);
                fs.stat(filePath, (err, stats) => {
                    if (err) return;
                    const now = new Date().getTime();
                    const endTime = new Date(stats.ctime).getTime() + 3600000;
                    if (now > endTime) fs.unlink(filePath, () => { });
                });
            }
        });
    }
}

export default CronService;