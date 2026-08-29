import { CronJob } from "cron";
import prismaClient from "../prisma";
import { StatusPagamento, StatusContrato, TipoAviso, Role } from "@prisma/client";
import { addDays, differenceInDays } from "date-fns";
import fs from 'fs';
import path from 'path';
import { EmailService } from "../functions/emailService";
import { EmailTemplates } from "../functions/email-templates";
import { getDataAtualBrasil, verificarAtraso, intervaloDoDiaBrasil } from "../utils/dateUtils";

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
        const candidatas = await prismaClient.fatura.findMany({
            where: { status: StatusPagamento.PENDENTE },
            select: { id: true, dataVencimento: true }
        });

        const idsAtrasadas = candidatas
            .filter(f => verificarAtraso(f.dataVencimento))
            .map(f => f.id);

        if (idsAtrasadas.length > 0) {
            await prismaClient.fatura.updateMany({
                where: { id: { in: idsAtrasadas } },
                data: { status: StatusPagamento.ATRASADO }
            });
        }

        console.log(`[CRON] ${idsAtrasadas.length} fatura(s) atualizada(s) para ATRASADO.`);
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

        const hojeIntervalo = intervaloDoDiaBrasil(hoje);
        const daqui3DiasIntervalo = intervaloDoDiaBrasil(daqui3Dias);

        const faturasParaAvisar = await prismaClient.fatura.findMany({
            where: {
                status: StatusPagamento.PENDENTE,
                OR: [
                    { dataVencimento: { gte: hojeIntervalo.inicio, lte: hojeIntervalo.fim } },
                    { dataVencimento: { gte: daqui3DiasIntervalo.inicio, lte: daqui3DiasIntervalo.fim } }
                ]
            },
            include: {
                contrato: { include: { cliente: { include: { user: true } } } }
            }
        });

        for (const fatura of faturasParaAvisar) {
            const cliente = fatura.contrato.cliente;
            try {
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

            await prismaClient.avisos.create({
                data: {
                    userId: cliente.user.id,
                    titulo: 'Fatura Próxima do Vencimento',
                    conteudo: `Sua fatura de ${fatura.dataVencimento.toLocaleDateString('pt-BR')} no valor de R$ ${fatura.valorTotal.toFixed(2)} está próxima do vencimento.`,
                    tipo: TipoAviso.COBRANCA
                }
            });
        }
    }

    async verificarFimDeContrato() {
        const hoje = getDataAtualBrasil();

        const contratosAtivos = await prismaClient.contrato.findMany({
            where: { status: StatusContrato.ATIVO, dataFim: { not: null } },
            include: { cliente: { include: { user: true } }, apartamento: true }
        });

        for (const contrato of contratosAtivos) {
            if (!contrato.dataFim) continue;

            const diasRestantes = differenceInDays(contrato.dataFim, hoje);
            const dataFimFormatada = contrato.dataFim.toLocaleDateString('pt-BR');

            if ([30, 15, 7].includes(diasRestantes)) {
                await prismaClient.avisos.create({
                    data: {
                        userId: contrato.cliente.user.id,
                        titulo: 'Seu contrato está terminando',
                        conteudo: `Seu contrato termina em ${diasRestantes} dias (${dataFimFormatada}). Fale com a administração para renovar ou organizar sua saída.`,
                        tipo: TipoAviso.SISTEMA
                    }
                });

                try {
                    await emailService.sendEmail({
                        to: contrato.cliente.user.email,
                        subject: `Seu contrato termina em ${diasRestantes} dias`,
                        html: EmailTemplates.CLIENTE_CONTRATO_VENCENDO(contrato.cliente.nome, dataFimFormatada)
                    });
                } catch (error) {
                    console.error(`Erro ao notificar fim de contrato ${contrato.id}`);
                }
            }

            if (diasRestantes <= 0) {
                const admins = await prismaClient.user.findMany({ where: { role: Role.ADMIN } });
                await prismaClient.avisos.createMany({
                    data: admins.map(admin => ({
                        userId: admin.id,
                        titulo: 'Contrato Vencido',
                        conteudo: `O contrato de ${contrato.cliente.nome} (apto ${contrato.apartamento.numero}) venceu em ${dataFimFormatada} e ainda está ATIVO. Renove, transfira ou encerre.`,
                        tipo: TipoAviso.SISTEMA
                    }))
                });

                try {
                    await emailService.sendEmail({
                        to: process.env.ADMIN_EMAIL as string,
                        subject: 'Alerta: Contrato Vencido',
                        html: EmailTemplates.ADMIN_CONTRATO_VENCENDO(contrato.cliente.nome, contrato.apartamento.numero, dataFimFormatada)
                    });
                } catch (error) {
                    console.error(`Erro ao notificar admin sobre contrato vencido ${contrato.id}`);
                }
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