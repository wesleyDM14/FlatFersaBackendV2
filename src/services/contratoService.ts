import prismaClient from "../prisma";
import { StatusContrato, StatusApartamento, StatusPagamento, Role } from "@prisma/client";
import { addMonths, differenceInDays } from "date-fns";
import fs from 'fs';
import axios from "axios";
import getToken from "../functions/getToken";
import { EmailService } from "../functions/emailService";
import { EmailTemplates } from "../functions/email-templates";

const emailService = new EmailService();

class ContratoService {

    async solicitarContrato(userId: string, apartamentoId: string, dataInicio: string, duracaoMeses: number, diaVencimentoPreferencial: number) {

        const apto = await prismaClient.apartamento.findUnique({ where: { id: apartamentoId } });
        if (!apto) throw new Error('Apartamento não encontrado.');

        if (apto.status !== StatusApartamento.VAGO) {
            throw new Error('Este apartamento não está disponível para locação.');
        }

        const user = await prismaClient.user.findUnique({
            where: { id: userId },
            include: { cliente: true }
        });

        if (!user || !user.cliente) throw new Error('Perfil de cliente não encontrado.');

        const contratoAtivo = await prismaClient.contrato.findFirst({
            where: {
                clienteId: user.cliente.id,
                status: { in: ['ATIVO', 'AGUARDANDO_ASSINATURA', 'SOLICITADO'] }
            }
        });

        if (contratoAtivo) throw new Error('Você já possui uma solicitação ou contrato ativo.');

        const contrato = await prismaClient.contrato.create({
            data: {
                clienteId: user.cliente.id,
                apartamentoId: apartamentoId,
                dataInicio: new Date(dataInicio),
                duracaoMeses: duracaoMeses,
                status: StatusContrato.SOLICITADO,
                valorAluguel: apto.valorBase || 0,
                diaVencimento: diaVencimentoPreferencial || 5,
                leituraInicial: 0
            }
        });

        await prismaClient.apartamento.update({
            where: { id: apartamentoId },
            data: { status: StatusApartamento.OCUPADO }
        });

        await emailService.sendEmail({
            to: process.env.ADMIN_EMAIL as string,
            subject: 'Nova Solicitação de Contrato',
            html: EmailTemplates.ADMIN_NOVO_CONTRATO(user.cliente.nome)
        });

        await emailService.sendEmail({
            to: user.email,
            subject: 'Solicitação Enviada',
            html: EmailTemplates.CLIENTE_AGUARDANDO_APROVACAO(user.cliente.nome)
        });

        return contrato;
    }

    async configurarContrato(contratoId: string, valorAluguel: number, diaVencimento: number, leituraInicial: number, limiteKwhIsento: number) {

        const contrato = await prismaClient.contrato.findUnique({
            where: { id: contratoId },
            include: { cliente: { include: { user: true } } }
        });

        if (!contrato) throw new Error('Contrato não encontrado.');

        const contratoAtualizado = await prismaClient.contrato.update({
            where: { id: contratoId },
            data: {
                valorAluguel,
                diaVencimento,
                leituraInicial,
                limiteKwhIsento,
                status: StatusContrato.AGUARDANDO_ASSINATURA
            }
        });

        await emailService.sendEmail({
            to: contrato.cliente.user.email,
            subject: 'Contrato Aprovado - Pendente Assinatura',
            html: EmailTemplates.CLIENTE_CONTRATO_APROVADO(contrato.cliente.nome)
        });

        return contratoAtualizado;
    }

    async reprovarContrato(contratoId: string, motivo: string) {
        const contrato = await prismaClient.contrato.findUnique({
            where: { id: contratoId },
            include: { cliente: { include: { user: true } } }
        });

        if (!contrato) throw new Error('Contrato não encontrado.');

        await prismaClient.$transaction(async (prisma) => {
            await prisma.contrato.update({
                where: { id: contratoId },
                data: { status: StatusContrato.CANCELADO }
            });

            await prisma.apartamento.update({
                where: { id: contrato.apartamentoId },
                data: { status: StatusApartamento.VAGO }
            });
        });

        await emailService.sendEmail({
            to: contrato.cliente.user.email,
            subject: 'Solicitação de Contrato Reprovada',
            html: `<p>Sua solicitação foi reprovada. Motivo: ${motivo}</p>`
        });

        return;
    }

    async assinarContrato(contratoId: string, arquivoPDF: Express.Multer.File) {
        const contrato = await prismaClient.contrato.findUnique({ where: { id: contratoId } });

        if (!contrato) throw new Error('Contrato não encontrado.');
        if (contrato.status !== StatusContrato.AGUARDANDO_ASSINATURA) throw new Error('Contrato não está aguardando assinatura.');

        let linkPdf = '';
        try {
            const token = await getToken();
            const res = await axios.post(
                `${process.env.WORDPRESS_URL}/wp-json/wp/v2/media`,
                fs.createReadStream(arquivoPDF.path),
                {
                    headers: {
                        'Content-Disposition': `attachment; filename="${arquivoPDF.originalname}"`,
                        'Content-Type': arquivoPDF.mimetype,
                        'Authorization': `Bearer ${token}`
                    }
                }
            );
            if (fs.existsSync(arquivoPDF.path)) fs.unlinkSync(arquivoPDF.path);
            linkPdf = res.data.source_url;
        } catch (error) {
            if (fs.existsSync(arquivoPDF.path)) fs.unlinkSync(arquivoPDF.path);
            throw new Error('Erro ao salvar PDF do contrato no servidor.');
        }

        await prismaClient.$transaction(async (prisma) => {

            await prisma.contrato.update({
                where: { id: contratoId },
                data: {
                    assinado: true,
                    linkPdfContrato: linkPdf,
                    status: StatusContrato.ATIVO
                }
            });

            await prisma.apartamento.update({
                where: { id: contrato.apartamentoId },
                data: { status: StatusApartamento.OCUPADO }
            });

            const faturasParaCriar = [];
            const dataInicio = new Date(contrato.dataInicio);
            const diaVencimento = contrato.diaVencimento;

            let dataPrimeiroVencimento = new Date(dataInicio.getFullYear(), dataInicio.getMonth(), diaVencimento);

            if (dataPrimeiroVencimento <= dataInicio) {
                dataPrimeiroVencimento = addMonths(dataPrimeiroVencimento, 1);
            }

            const diasDeDiferenca = differenceInDays(dataPrimeiroVencimento, dataInicio);

            if (diasDeDiferenca < 15) {
                dataPrimeiroVencimento = addMonths(dataPrimeiroVencimento, 1);
            }

            let dataVencimentoAtual = dataPrimeiroVencimento;

            for (let i = 0; i < contrato.duracaoMeses; i++) {

                faturasParaCriar.push({
                    contratoId: contrato.id,
                    mesReferencia: addMonths(dataVencimentoAtual, -1),
                    dataVencimento: new Date(dataVencimentoAtual),
                    valorAluguel: contrato.valorAluguel,

                    leituraAnterior: i === 0 ? contrato.leituraInicial : 0,
                    leituraAtual: i === 0 ? contrato.leituraInicial : 0,
                    consumoTotal: 0,
                    consumoCobrado: 0,
                    precoKwhAplicado: 0,
                    valorEnergia: 0,

                    valorTotal: contrato.valorAluguel,
                    status: StatusPagamento.PENDENTE
                });

                dataVencimentoAtual = addMonths(dataVencimentoAtual, 1);
            }

            await prisma.fatura.createMany({
                data: faturasParaCriar
            });
        });

        return { message: "Contrato ativado e faturas geradas com sucesso!" };
    }

    async cancelarContrato(contratoId: string, motivo: string) {
        const contrato = await prismaClient.contrato.findUnique({
            where: { id: contratoId },
            include: { cliente: { include: { user: true } } }
        });

        if (!contrato) throw new Error('Contrato não encontrado.');

        await prismaClient.$transaction(async (prisma) => {
            await prisma.contrato.update({
                where: { id: contratoId },
                data: { status: StatusContrato.CANCELADO }
            });

            await prisma.apartamento.update({
                where: { id: contrato.apartamentoId },
                data: { status: StatusApartamento.VAGO }
            });

            await prisma.fatura.updateMany({
                where: {
                    contratoId: contratoId,
                    status: StatusPagamento.PENDENTE
                },
                data: { status: StatusPagamento.CANCELADO }
            });
        });

        await prismaClient.avisos.create({
            data: {
                userId: contrato.cliente.user.id,
                titulo: 'Contrato Encerrado',
                conteudo: `Seu contrato foi encerrado administrativamente. Motivo: ${motivo}`
            }
        });

        // (Opcional) Enviar email de cancelamento

        return;
    }

    async getAllContratos() {
        return await prismaClient.contrato.findMany({
            include: {
                cliente: true,
                apartamento: { include: { predio: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    async getContratoById(contratoId: string, userId: string, role: string) {
        const contrato = await prismaClient.contrato.findUnique({
            where: { id: contratoId },
            include: {
                cliente: true,
                apartamento: { include: { predio: true } },
                faturas: { orderBy: { dataVencimento: 'asc' } }
            }
        });

        if (!contrato) throw new Error('Contrato não encontrado.');

        if (role !== 'ADMIN' && contrato.cliente.userId !== userId) {
            throw new Error('Você não tem permissão para visualizar este contrato.');
        }

        return contrato;
    }

    async getContratosByCliente(userId: string) {
        const cliente = await prismaClient.cliente.findUnique({ where: { userId } });
        if (!cliente) throw new Error('Perfil de cliente não encontrado.');

        return await prismaClient.contrato.findMany({
            where: { clienteId: cliente.id },
            include: {
                apartamento: { include: { predio: true } },
                faturas: {
                    where: { status: { not: 'CANCELADO' } },
                    orderBy: { dataVencimento: 'asc' }
                }
            }
        });
    }
}

export default ContratoService;