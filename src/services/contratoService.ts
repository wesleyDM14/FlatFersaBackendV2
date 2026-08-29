import prismaClient from "../prisma";
import { StatusContrato, StatusApartamento, StatusPagamento, StatusCadastro, Role, TipoAviso } from "@prisma/client";
import { addMonths, differenceInDays, differenceInCalendarMonths } from "date-fns";
import fs from 'fs';
import axios from "axios";
import getToken from "../functions/getToken";
import { EmailService } from "../functions/emailService";
import { EmailTemplates } from "../functions/email-templates";
import { getDataAtualBrasil } from "../utils/dateUtils";

const emailService = new EmailService();

interface FaturaParaCriar {
    contratoId: string;
    mesReferencia: Date;
    dataVencimento: Date;
    valorAluguel: number;
    leituraAnterior: number;
    leituraAtual: number;
    consumoTotal: number;
    consumoCobrado: number;
    precoKwhAplicado: number;
    valorEnergia: number;
    valorTotal: number;
    status: StatusPagamento;
}

function gerarFaturasDoPeriodo(contratoId: string, dataInicio: Date, diaVencimento: number, duracaoMeses: number, valorAluguel: number, leituraInicial: number): FaturaParaCriar[] {
    const faturas: FaturaParaCriar[] = [];

    let dataPrimeiroVencimento = new Date(dataInicio.getFullYear(), dataInicio.getMonth(), diaVencimento);

    if (dataPrimeiroVencimento <= dataInicio) {
        dataPrimeiroVencimento = addMonths(dataPrimeiroVencimento, 1);
    }

    const diasDeDiferenca = differenceInDays(dataPrimeiroVencimento, dataInicio);
    if (diasDeDiferenca < 15) {
        dataPrimeiroVencimento = addMonths(dataPrimeiroVencimento, 1);
    }

    let dataVencimentoAtual = dataPrimeiroVencimento;

    for (let i = 0; i < duracaoMeses; i++) {
        faturas.push({
            contratoId,
            mesReferencia: addMonths(dataVencimentoAtual, -1),
            dataVencimento: new Date(dataVencimentoAtual),
            valorAluguel,
            leituraAnterior: i === 0 ? leituraInicial : 0,
            leituraAtual: i === 0 ? leituraInicial : 0,
            consumoTotal: 0,
            consumoCobrado: 0,
            precoKwhAplicado: 0,
            valorEnergia: 0,
            valorTotal: valorAluguel,
            status: StatusPagamento.PENDENTE
        });

        dataVencimentoAtual = addMonths(dataVencimentoAtual, 1);
    }

    return faturas;
}

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

        const admins = await prismaClient.user.findMany({ where: { role: Role.ADMIN } });
        await prismaClient.avisos.createMany({
            data: admins.map(admin => ({
                userId: admin.id,
                titulo: 'Nova Solicitação de Contrato',
                conteudo: `${user.cliente!.nome} solicitou um novo contrato.`,
                tipo: TipoAviso.SISTEMA
            }))
        });

        await prismaClient.avisos.create({
            data: {
                userId: user.id,
                titulo: 'Solicitação Enviada',
                conteudo: 'Sua solicitação de contrato foi enviada e está em análise.',
                tipo: TipoAviso.SISTEMA
            }
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

    async criarContratoDireto(dados: {
        clienteId: string;
        apartamentoId: string;
        dataInicio: string;
        duracaoMeses: number;
        diaVencimento: number;
        valorAluguel: number;
        leituraInicial: number;
        limiteKwhIsento?: number;
    }) {
        const cliente = await prismaClient.cliente.findUnique({
            where: { id: dados.clienteId },
            include: { user: true }
        });
        if (!cliente) throw new Error('Cliente não encontrado.');
        if (cliente.statusCadastro !== StatusCadastro.APROVADO) {
            throw new Error('Este cliente precisa estar com o cadastro aprovado.');
        }

        const apto = await prismaClient.apartamento.findUnique({ where: { id: dados.apartamentoId } });
        if (!apto) throw new Error('Apartamento não encontrado.');
        if (apto.status !== StatusApartamento.VAGO) throw new Error('Este apartamento não está disponível para locação.');

        if (dados.duracaoMeses < 6) throw new Error('A duração mínima do contrato é de 6 meses.');

        const contratoAtivo = await prismaClient.contrato.findFirst({
            where: {
                clienteId: dados.clienteId,
                status: { in: ['ATIVO', 'AGUARDANDO_ASSINATURA', 'SOLICITADO'] }
            }
        });
        if (contratoAtivo) throw new Error('Este cliente já possui uma solicitação ou contrato ativo.');

        const contrato = await prismaClient.$transaction(async (prisma) => {
            const novo = await prisma.contrato.create({
                data: {
                    clienteId: dados.clienteId,
                    apartamentoId: dados.apartamentoId,
                    dataInicio: new Date(dados.dataInicio),
                    duracaoMeses: dados.duracaoMeses,
                    diaVencimento: dados.diaVencimento,
                    valorAluguel: dados.valorAluguel,
                    leituraInicial: dados.leituraInicial,
                    limiteKwhIsento: dados.limiteKwhIsento || 0,
                    status: StatusContrato.AGUARDANDO_ASSINATURA
                }
            });

            await prisma.apartamento.update({
                where: { id: dados.apartamentoId },
                data: { status: StatusApartamento.OCUPADO }
            });

            await prisma.avisos.create({
                data: {
                    userId: cliente.user.id,
                    titulo: 'Novo Contrato Disponível',
                    conteudo: 'Um novo contrato foi criado para você e está pronto para assinatura.',
                    tipo: TipoAviso.SISTEMA
                }
            });

            return novo;
        });

        await emailService.sendEmail({
            to: cliente.user.email,
            subject: 'Contrato Pronto para Assinatura',
            html: EmailTemplates.CLIENTE_CONTRATO_APROVADO(cliente.nome)
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

        await prismaClient.avisos.create({
            data: {
                userId: contrato.cliente.user.id,
                titulo: 'Contrato Aprovado',
                conteudo: 'Seu contrato foi aprovado e está pronto para assinatura.',
                tipo: TipoAviso.SISTEMA
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

            await prisma.avisos.create({
                data: {
                    userId: contrato.cliente.user.id,
                    titulo: 'Solicitação de Contrato Reprovada',
                    conteudo: `Sua solicitação foi reprovada. Motivo: ${motivo}`,
                    tipo: TipoAviso.SISTEMA
                }
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

        const dataInicio = new Date(contrato.dataInicio);
        const dataFim = addMonths(dataInicio, contrato.duracaoMeses);

        await prismaClient.$transaction(async (prisma) => {

            await prisma.contrato.update({
                where: { id: contratoId },
                data: {
                    assinado: true,
                    linkPdfContrato: linkPdf,
                    status: StatusContrato.ATIVO,
                    dataFim
                }
            });

            await prisma.apartamento.update({
                where: { id: contrato.apartamentoId },
                data: { status: StatusApartamento.OCUPADO }
            });

            const faturasParaCriar = gerarFaturasDoPeriodo(
                contrato.id,
                dataInicio,
                contrato.diaVencimento,
                contrato.duracaoMeses,
                contrato.valorAluguel,
                contrato.leituraInicial
            );

            await prisma.fatura.createMany({
                data: faturasParaCriar
            });
        });

        return { message: "Contrato ativado e faturas geradas com sucesso!" };
    }

    async editarContrato(contratoId: string, dados: { valorAluguel?: number; diaVencimento?: number; limiteKwhIsento?: number; duracaoMeses?: number }) {
        const contrato = await prismaClient.contrato.findUnique({
            where: { id: contratoId },
            include: { cliente: { include: { user: true } } }
        });

        if (!contrato) throw new Error('Contrato não encontrado.');
        if (contrato.status !== StatusContrato.ATIVO) throw new Error('Só é possível editar um contrato ativo.');

        const novaDuracao = dados.duracaoMeses ?? contrato.duracaoMeses;
        const novoValorAluguel = dados.valorAluguel ?? contrato.valorAluguel;
        const novoDiaVencimento = dados.diaVencimento ?? contrato.diaVencimento;
        const novoLimiteKwh = dados.limiteKwhIsento ?? contrato.limiteKwhIsento;
        const novaDataFim = addMonths(new Date(contrato.dataInicio), novaDuracao);

        await prismaClient.$transaction(async (prisma) => {
            await prisma.contrato.update({
                where: { id: contratoId },
                data: {
                    valorAluguel: novoValorAluguel,
                    diaVencimento: novoDiaVencimento,
                    limiteKwhIsento: novoLimiteKwh,
                    duracaoMeses: novaDuracao,
                    dataFim: novaDataFim
                }
            });

            if (dados.valorAluguel !== undefined && dados.valorAluguel !== contrato.valorAluguel) {
                const faturasFuturas = await prisma.fatura.findMany({
                    where: {
                        contratoId,
                        status: { in: [StatusPagamento.PENDENTE, StatusPagamento.EM_ANALISE] }
                    }
                });

                for (const fatura of faturasFuturas) {
                    const novoValorTotal = novoValorAluguel + fatura.valorEnergia + fatura.valorMulta + fatura.acrescimoAplicado - fatura.descontoAplicado;
                    await prisma.fatura.update({
                        where: { id: fatura.id },
                        data: { valorAluguel: novoValorAluguel, valorTotal: novoValorTotal }
                    });
                }
            }

            await prisma.avisos.create({
                data: {
                    userId: contrato.cliente.user.id,
                    titulo: 'Contrato Atualizado',
                    conteudo: `As condições do seu contrato foram atualizadas. Novo valor: R$ ${novoValorAluguel.toFixed(2)}, vencimento dia ${novoDiaVencimento}.`,
                    tipo: TipoAviso.SISTEMA
                }
            });
        });

        await emailService.sendEmail({
            to: contrato.cliente.user.email,
            subject: 'Seu contrato foi atualizado',
            html: EmailTemplates.CLIENTE_CONTRATO_EDITADO(contrato.cliente.nome, novoValorAluguel, novoDiaVencimento)
        });

        return { message: 'Contrato atualizado com sucesso.' };
    }

    async renovarContrato(contratoId: string, duracaoMeses: number, opcoes?: { valorAluguel?: number; diaVencimento?: number; limiteKwhIsento?: number }) {
        const contratoAtual = await prismaClient.contrato.findUnique({
            where: { id: contratoId },
            include: { cliente: { include: { user: true } } }
        });

        if (!contratoAtual) throw new Error('Contrato não encontrado.');
        if (contratoAtual.status !== StatusContrato.ATIVO) throw new Error('Só é possível renovar um contrato ativo.');
        if (!duracaoMeses || duracaoMeses < 1) throw new Error('Duração da renovação inválida.');

        const hoje = getDataAtualBrasil();
        const valorAluguel = opcoes?.valorAluguel ?? contratoAtual.valorAluguel;
        const diaVencimento = opcoes?.diaVencimento ?? contratoAtual.diaVencimento;
        const limiteKwhIsento = opcoes?.limiteKwhIsento ?? contratoAtual.limiteKwhIsento;

        const ultimaFatura = await prismaClient.fatura.findFirst({
            where: { contratoId: contratoAtual.id },
            orderBy: { dataVencimento: 'desc' }
        });
        const leituraInicialNova = ultimaFatura?.leituraAtual ?? contratoAtual.leituraInicial;

        const novoContrato = await prismaClient.$transaction(async (prisma) => {
            await prisma.contrato.update({
                where: { id: contratoId },
                data: { status: StatusContrato.RENOVADO, dataFim: hoje }
            });

            const novo = await prisma.contrato.create({
                data: {
                    clienteId: contratoAtual.clienteId,
                    apartamentoId: contratoAtual.apartamentoId,
                    status: StatusContrato.ATIVO,
                    dataInicio: hoje,
                    dataFim: addMonths(hoje, duracaoMeses),
                    duracaoMeses,
                    diaVencimento,
                    valorAluguel,
                    leituraInicial: leituraInicialNova,
                    limiteKwhIsento,
                    assinado: true,
                    contratoAnteriorId: contratoAtual.id
                }
            });

            const faturasParaCriar = gerarFaturasDoPeriodo(novo.id, hoje, diaVencimento, duracaoMeses, valorAluguel, leituraInicialNova);
            await prisma.fatura.createMany({ data: faturasParaCriar });

            await prisma.avisos.create({
                data: {
                    userId: contratoAtual.cliente.user.id,
                    titulo: 'Contrato Renovado',
                    conteudo: `Seu contrato foi renovado por mais ${duracaoMeses} meses.`,
                    tipo: TipoAviso.SISTEMA
                }
            });

            return novo;
        });

        await emailService.sendEmail({
            to: contratoAtual.cliente.user.email,
            subject: 'Contrato Renovado com Sucesso',
            html: EmailTemplates.CLIENTE_CONTRATO_RENOVADO(contratoAtual.cliente.nome, duracaoMeses)
        });

        return novoContrato;
    }

    async transferirApartamento(contratoId: string, novoApartamentoId: string, leituraInicialNovoApto: number, opcoes?: { valorAluguel?: number }) {
        const contratoAtual = await prismaClient.contrato.findUnique({
            where: { id: contratoId },
            include: { cliente: { include: { user: true } } }
        });

        if (!contratoAtual) throw new Error('Contrato não encontrado.');
        if (contratoAtual.status !== StatusContrato.ATIVO) throw new Error('Só é possível transferir um contrato ativo.');
        if (novoApartamentoId === contratoAtual.apartamentoId) throw new Error('O apartamento de destino deve ser diferente do atual.');
        if (leituraInicialNovoApto === undefined || leituraInicialNovoApto === null) {
            throw new Error('Informe a leitura inicial do medidor do novo apartamento.');
        }

        const novoApartamento = await prismaClient.apartamento.findUnique({ where: { id: novoApartamentoId } });
        if (!novoApartamento) throw new Error('Apartamento de destino não encontrado.');
        if (novoApartamento.status !== StatusApartamento.VAGO) throw new Error('Apartamento de destino não está vago.');

        const hoje = getDataAtualBrasil();
        const valorAluguel = opcoes?.valorAluguel ?? novoApartamento.valorBase ?? contratoAtual.valorAluguel;
        const duracaoRestante = contratoAtual.dataFim
            ? Math.max(1, differenceInCalendarMonths(contratoAtual.dataFim, hoje))
            : contratoAtual.duracaoMeses;

        const novoContrato = await prismaClient.$transaction(async (prisma) => {
            await prisma.contrato.update({
                where: { id: contratoId },
                data: { status: StatusContrato.TRANSFERIDO, dataFim: hoje }
            });

            await prisma.apartamento.update({
                where: { id: contratoAtual.apartamentoId },
                data: { status: StatusApartamento.VAGO }
            });

            await prisma.apartamento.update({
                where: { id: novoApartamentoId },
                data: { status: StatusApartamento.OCUPADO }
            });

            await prisma.fatura.updateMany({
                where: {
                    contratoId,
                    status: { in: [StatusPagamento.PENDENTE, StatusPagamento.EM_ANALISE] }
                },
                data: { status: StatusPagamento.CANCELADO }
            });

            const novo = await prisma.contrato.create({
                data: {
                    clienteId: contratoAtual.clienteId,
                    apartamentoId: novoApartamentoId,
                    status: StatusContrato.ATIVO,
                    dataInicio: hoje,
                    dataFim: addMonths(hoje, duracaoRestante),
                    duracaoMeses: duracaoRestante,
                    diaVencimento: contratoAtual.diaVencimento,
                    valorAluguel,
                    leituraInicial: leituraInicialNovoApto,
                    limiteKwhIsento: contratoAtual.limiteKwhIsento,
                    assinado: true,
                    contratoAnteriorId: contratoAtual.id
                }
            });

            const faturasParaCriar = gerarFaturasDoPeriodo(novo.id, hoje, contratoAtual.diaVencimento, duracaoRestante, valorAluguel, leituraInicialNovoApto);
            await prisma.fatura.createMany({ data: faturasParaCriar });

            await prisma.avisos.create({
                data: {
                    userId: contratoAtual.cliente.user.id,
                    titulo: 'Apartamento Transferido',
                    conteudo: `Seu contrato foi transferido para o apartamento ${novoApartamento.numero}.`,
                    tipo: TipoAviso.SISTEMA
                }
            });

            return novo;
        });

        await emailService.sendEmail({
            to: contratoAtual.cliente.user.email,
            subject: 'Transferência de Apartamento Confirmada',
            html: EmailTemplates.CLIENTE_CONTRATO_TRANSFERIDO(contratoAtual.cliente.nome, novoApartamento.numero)
        });

        return novoContrato;
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
                conteudo: `Seu contrato foi encerrado administrativamente. Motivo: ${motivo}`,
                tipo: TipoAviso.SISTEMA
            }
        });

        await emailService.sendEmail({
            to: contrato.cliente.user.email,
            subject: 'Contrato Encerrado',
            html: EmailTemplates.CLIENTE_CONTRATO_CANCELADO(contrato.cliente.nome, motivo)
        });

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