import prismaClient from "../prisma";
import { StatusPagamento, Role } from "@prisma/client";
import { generateQrCodePix } from "../functions/generatePix";
import getToken from "../functions/getToken";
import axios from "axios";
import fs from 'fs';
import { EmailService } from "../functions/emailService";
import { EmailTemplates } from "../functions/email-templates";

const emailService = new EmailService();

class FaturaService {

    async lancarLeitura(faturaId: string, leituraAtual: number, fotoLeitura?: Express.Multer.File) {
        const fatura = await prismaClient.fatura.findUnique({
            where: { id: faturaId },
            include: {
                contrato: {
                    include: {
                        apartamento: { include: { predio: true } },
                        cliente: { include: { user: true } }
                    }
                }
            }
        });

        if (!fatura) throw new Error('Fatura não encontrada.');

        if (fatura.status === StatusPagamento.PAGO) {
            throw new Error('Não é possível alterar leitura de uma fatura já paga.');
        }

        let fotoUrl = fatura.fotoLeituraUrl;
        if (fotoLeitura) {
            try {
                const token = await getToken();
                const res = await axios.post(
                    `${process.env.WORDPRESS_URL}/wp-json/wp/v2/media`,
                    fs.createReadStream(fotoLeitura.path),
                    {
                        headers: {
                            'Content-Disposition': `attachment; filename="${fotoLeitura.originalname}"`,
                            'Content-Type': fotoLeitura.mimetype,
                            'Authorization': `Bearer ${token}`
                        }
                    }
                );
                if (fs.existsSync(fotoLeitura.path)) fs.unlinkSync(fotoLeitura.path);
                fotoUrl = res.data.source_url;
            } catch (err: any) {
                console.error("Erro upload foto:", err.message);
            }
        }

        const leituraAnterior = fatura.leituraAnterior;

        if (leituraAtual < leituraAnterior) {
            throw new Error(`A leitura atual (${leituraAtual}) não pode ser menor que a anterior (${leituraAnterior}).`);
        }

        const consumoTotal = leituraAtual - leituraAnterior;
        const limiteIsento = fatura.contrato.limiteKwhIsento;

        const consumoCobrado = Math.max(0, consumoTotal - limiteIsento);
        const precoKwh = fatura.contrato.apartamento.predio.precoKwhAtual;
        const valorEnergia = consumoCobrado * precoKwh;

        const valorTotal = fatura.valorAluguel + valorEnergia + fatura.valorMulta + fatura.acrescimoAplicado - fatura.descontoAplicado;

        await prismaClient.$transaction(async (prisma) => {
            await prisma.fatura.update({
                where: { id: faturaId },
                data: {
                    leituraAtual,
                    consumoTotal,
                    consumoCobrado,
                    precoKwhAplicado: precoKwh,
                    valorEnergia,
                    valorTotal,
                    fotoLeituraUrl: fotoUrl
                }
            });

            const proximaFatura = await prisma.fatura.findFirst({
                where: {
                    contratoId: fatura.contratoId,
                    dataVencimento: { gt: fatura.dataVencimento }
                },
                orderBy: { dataVencimento: 'asc' }
            });

            if (proximaFatura && proximaFatura.status === StatusPagamento.PENDENTE) {
                await prisma.fatura.update({
                    where: { id: proximaFatura.id },
                    data: { leituraAnterior: leituraAtual }
                });
            }
        });

        return { message: "Leitura lançada com sucesso.", valorTotal };
    }

    async editarValoresManuais(faturaId: string, multa: number, acrescimo: number, desconto: number, observacao: string) {
        const fatura = await prismaClient.fatura.findUnique({ where: { id: faturaId } });

        if (!fatura) throw new Error('Fatura não encontrada.');
        if (fatura.status === StatusPagamento.PAGO) throw new Error('Fatura já paga.');

        const valorTotal = fatura.valorAluguel + fatura.valorEnergia + multa + acrescimo - desconto;

        return await prismaClient.fatura.update({
            where: { id: faturaId },
            data: {
                valorMulta: multa,
                acrescimoAplicado: acrescimo,
                descontoAplicado: desconto,
                observacao: observacao,
                valorTotal: valorTotal
            }
        });
    }

    async enviarComprovante(faturaId: string, arquivo: Express.Multer.File) {
        const fatura = await prismaClient.fatura.findUnique({
            where: { id: faturaId },
            include: {
                contrato: {
                    include: {
                        cliente: { include: { user: true } }
                    }
                }
            }
        });

        if (!fatura) throw new Error('Fatura não encontrada.');
        if (fatura.status === StatusPagamento.PAGO) throw new Error('Já consta como paga.');

        let comprovanteUrl = '';
        try {
            const token = await getToken();
            const res = await axios.post(
                `${process.env.WORDPRESS_URL}/wp-json/wp/v2/media`,
                fs.createReadStream(arquivo.path),
                {
                    headers: {
                        'Content-Disposition': `attachment; filename="${arquivo.originalname}"`,
                        'Content-Type': arquivo.mimetype,
                        'Authorization': `Bearer ${token}`
                    }
                }
            );
            fs.unlinkSync(arquivo.path);
            comprovanteUrl = res.data.source_url;
        } catch (err: any) {
            if (fs.existsSync(arquivo.path)) fs.unlinkSync(arquivo.path);
            throw new Error('Erro no upload do comprovante.');
        }

        await prismaClient.fatura.update({
            where: { id: faturaId },
            data: {
                status: StatusPagamento.EM_ANALISE,
                comprovanteUrl: comprovanteUrl,
                dataPagamento: new Date()
            }
        });

        const adminLink = `https://app.flatfersa.com.br/financeiro/faturas/${faturaId}`;
        await emailService.sendEmail({
            to: process.env.ADMIN_EMAIL as string,
            subject: `Comprovante Recebido - ${fatura.contrato.cliente.nome}`,
            html: EmailTemplates.ADMIN_NOVO_COMPROVANTE(
                fatura.contrato.cliente.nome,
                fatura.valorTotal,
                adminLink
            )
        });

        return { message: "Comprovante enviado." };
    }

    async aprovarPagamento(faturaId: string) {
        const fatura = await prismaClient.fatura.findUnique({
            where: { id: faturaId },
            include: {
                contrato: {
                    include: {
                        cliente: { include: { user: true } }
                    }
                }
            }
        });

        if (!fatura) throw new Error('Fatura não encontrada.');

        await prismaClient.fatura.update({
            where: { id: faturaId },
            data: {
                status: StatusPagamento.PAGO,
                dataPagamento: new Date()
            }
        });

        await emailService.sendEmail({
            to: fatura.contrato.cliente.user.email,
            subject: 'Pagamento Confirmado',
            html: EmailTemplates.CLIENTE_PAGAMENTO_CONFIRMADO(
                fatura.contrato.cliente.nome,
                fatura.dataVencimento.toLocaleDateString('pt-BR'),
                fatura.valorTotal
            )
        });

        return { message: "Pagamento aprovado." };
    }

    async reprovarPagamento(faturaId: string, motivo: string) {
        const fatura = await prismaClient.fatura.findUnique({
            where: { id: faturaId },
            include: {
                contrato: {
                    include: {
                        cliente: { include: { user: true } }
                    }
                }
            }
        });

        if (!fatura) throw new Error('Fatura não encontrada.');

        await prismaClient.fatura.update({
            where: { id: faturaId },
            data: {
                status: StatusPagamento.PENDENTE,
                comprovanteUrl: null,
                observacao: `REPROVADO: ${motivo}`
            }
        });

        await emailService.sendEmail({
            to: fatura.contrato.cliente.user.email,
            subject: 'Problema no Pagamento',
            html: EmailTemplates.CLIENTE_PAGAMENTO_REPROVADO(
                fatura.contrato.cliente.nome,
                fatura.dataVencimento.toLocaleDateString('pt-BR'),
                motivo
            )
        });

        return { message: "Pagamento reprovado." };
    }

    async gerarPix(faturaId: string) {
        const fatura = await prismaClient.fatura.findUnique({ where: { id: faturaId } });
        if (!fatura) throw new Error('Fatura não encontrada.');

        if (fatura.status === StatusPagamento.PAGO) return { message: "Já pago." };

        const payload = {
            version: '01',
            key: '+5584999381079',
            name: 'FLATFERSA',
            city: 'ANGICOS',
            cep: '59515000',
            value: fatura.valorTotal
        };

        return await generateQrCodePix(payload);
    }

    async getFaturasByContrato(contratoId: string) {
        return await prismaClient.fatura.findMany({
            where: { contratoId },
            orderBy: { dataVencimento: 'asc' }
        });
    }

    async getAllFaturasAdmin() {
        return await prismaClient.fatura.findMany({
            include: {
                contrato: {
                    include: {
                        cliente: true,
                        apartamento: { include: { predio: true } }
                    }
                }
            },
            orderBy: { dataVencimento: 'asc' }
        });
    }

    async getFaturaById(faturaId: string) {
        return await prismaClient.fatura.findUnique({
            where: { id: faturaId },
            include: {
                contrato: {
                    include: {
                        cliente: true,
                        apartamento: { include: { predio: true } }
                    }
                }
            }
        });
    }
}

export default FaturaService;