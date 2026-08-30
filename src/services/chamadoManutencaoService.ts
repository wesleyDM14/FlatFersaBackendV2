import prismaClient from "../prisma";
import { StatusChamado, PrioridadeChamado, StatusContrato } from "@prisma/client";
import { uploadToWordPress } from "../functions/uploadToWordPress";

class ChamadoManutencaoService {

    async criarChamado(userId: string, dados: { titulo: string; descricao: string; prioridade?: PrioridadeChamado }, foto?: Express.Multer.File) {
        const cliente = await prismaClient.cliente.findUnique({ where: { userId } });
        if (!cliente) throw new Error('Perfil de cliente não encontrado.');

        const contratoAtivo = await prismaClient.contrato.findFirst({
            where: { clienteId: cliente.id, status: StatusContrato.ATIVO },
            include: { apartamento: { select: { id: true, numero: true } } }
        });
        if (!contratoAtivo) throw new Error('Você precisa ter um contrato ativo para abrir um chamado.');

        const fotoUrl = foto ? await uploadToWordPress(foto) : null;

        const chamado = await prismaClient.chamadoManutencao.create({
            data: {
                titulo: dados.titulo,
                descricao: dados.descricao,
                prioridade: dados.prioridade || PrioridadeChamado.MEDIA,
                fotoUrl,
                apartamentoId: contratoAtivo.apartamento.id,
                clienteId: cliente.id,
            }
        });

        const admins = await prismaClient.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
        if (admins.length > 0) {
            await prismaClient.avisos.createMany({
                data: admins.map(admin => ({
                    userId: admin.id,
                    titulo: 'Novo Chamado de Manutenção',
                    conteudo: `${cliente.nome} abriu um chamado para o Apto ${contratoAtivo.apartamento.numero}: "${dados.titulo}".`,
                    tipo: 'MANUTENCAO' as const,
                }))
            });
        }

        return chamado;
    }

    async getChamados() {
        return await prismaClient.chamadoManutencao.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                cliente: { select: { nome: true, telefone: true } },
                apartamento: { select: { numero: true, predio: { select: { nome: true } } } }
            }
        });
    }

    async getMeusChamados(userId: string) {
        const cliente = await prismaClient.cliente.findUnique({ where: { userId } });
        if (!cliente) throw new Error('Perfil de cliente não encontrado.');

        return await prismaClient.chamadoManutencao.findMany({
            where: { clienteId: cliente.id },
            orderBy: { createdAt: 'desc' },
            include: {
                apartamento: { select: { numero: true, predio: { select: { nome: true } } } }
            }
        });
    }

    async getChamadoById(chamadoId: string, userId: string, role: string) {
        const chamado = await prismaClient.chamadoManutencao.findUnique({
            where: { id: chamadoId },
            include: {
                cliente: { select: { nome: true, telefone: true, userId: true } },
                apartamento: { select: { numero: true, predio: { select: { nome: true } } } }
            }
        });
        if (!chamado) throw new Error('Chamado não encontrado.');

        if (role !== 'ADMIN' && chamado.cliente.userId !== userId) {
            throw new Error('Acesso negado.');
        }

        return chamado;
    }

    async atualizarStatus(chamadoId: string, status: StatusChamado, respostaAdmin?: string) {
        const chamado = await prismaClient.chamadoManutencao.findUnique({
            where: { id: chamadoId },
            include: { cliente: { select: { userId: true } }, apartamento: { select: { numero: true } } }
        });
        if (!chamado) throw new Error('Chamado não encontrado.');

        const atualizado = await prismaClient.chamadoManutencao.update({
            where: { id: chamadoId },
            data: {
                status,
                respostaAdmin: respostaAdmin ?? chamado.respostaAdmin,
                resolvidoEm: status === StatusChamado.CONCLUIDO ? new Date() : chamado.resolvidoEm,
            }
        });

        const STATUS_LABELS: Record<string, string> = {
            ABERTO: 'Aberto',
            EM_ANDAMENTO: 'Em Andamento',
            CONCLUIDO: 'Concluído',
            CANCELADO: 'Cancelado',
        };

        await prismaClient.avisos.create({
            data: {
                userId: chamado.cliente.userId,
                titulo: 'Atualização do seu Chamado',
                conteudo: `Seu chamado sobre o Apto ${chamado.apartamento.numero} agora está: ${STATUS_LABELS[status]}.${respostaAdmin ? ` "${respostaAdmin}"` : ''}`,
                tipo: 'MANUTENCAO',
            }
        });

        return atualizado;
    }
}

export default ChamadoManutencaoService;
