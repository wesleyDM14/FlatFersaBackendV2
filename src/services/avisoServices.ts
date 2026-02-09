import prismaClient from "../prisma";
import { TipoAviso, Role } from "@prisma/client";

class AvisoService {

    async createAvisoGeral(titulo: string, conteudo: string, tipo: TipoAviso = 'GERAL') {
        try {
            const inquilinos = await prismaClient.user.findMany({
                where: { role: Role.INQUILINO },
                select: { id: true }
            });

            if (inquilinos.length === 0) return { message: 'Nenhum inquilino encontrado.' };

            const avisosData = inquilinos.map(user => ({
                titulo,
                conteudo,
                tipo,
                userId: user.id,
                lido: false
            }));

            await prismaClient.avisos.createMany({
                data: avisosData,
            });

            return { message: `Aviso enviado para ${inquilinos.length} inquilinos.` };

        } catch (error: any) {
            throw new Error('Erro ao enviar aviso geral: ' + error.message);
        }
    }

    async createAvisoIndividual(userId: string, titulo: string, conteudo: string, tipo: TipoAviso = 'GERAL') {
        const user = await prismaClient.user.findUnique({ where: { id: userId } });

        if (!user) throw new Error('Usuário não encontrado.');

        const aviso = await prismaClient.avisos.create({
            data: {
                titulo,
                conteudo,
                tipo,
                userId,
                lido: false
            }
        });

        return aviso;
    }

    async getAvisosByUserId(userId: string) {
        return await prismaClient.avisos.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' }
        });
    }

    async markAsRead(avisoId: string, userId: string) {
        const aviso = await prismaClient.avisos.findUnique({ where: { id: avisoId } });

        if (!aviso) throw new Error('Aviso não encontrado.');

        if (aviso.userId !== userId) throw new Error('Acesso negado.');

        await prismaClient.avisos.update({
            where: { id: avisoId },
            data: { lido: true }
        });

        return;
    }

    async deleteAviso(avisoId: string, userId: string, role: string) {
        const aviso = await prismaClient.avisos.findUnique({ where: { id: avisoId } });

        if (!aviso) throw new Error('Aviso não encontrado.');

        if (role !== 'ADMIN' && aviso.userId !== userId) {
            throw new Error('Sem permissão para deletar este aviso.');
        }

        await prismaClient.avisos.delete({ where: { id: avisoId } });
        return;
    }
}

export default AvisoService;