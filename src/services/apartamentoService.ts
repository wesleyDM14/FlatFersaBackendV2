import prismaClient from "../prisma";
import { StatusApartamento } from "@prisma/client";

interface CreateApartamentoData {
    numero: string;
    valorBase: number;
    climatizado: boolean;
    predioId: string;
}

class ApartamentoService {

    async createApartamento(data: CreateApartamentoData) {
        try {
            const currentPredio = await prismaClient.predio.findUnique({ where: { id: data.predioId } });

            if (!currentPredio) {
                throw new Error('Prédio não encontrado.');
            }

            const aptoExistente = await prismaClient.apartamento.findFirst({
                where: {
                    predioId: data.predioId,
                    numero: data.numero
                }
            });

            if (aptoExistente) {
                throw new Error('Já existe um apartamento com este número neste prédio.');
            }

            const newApartamento = await prismaClient.apartamento.create({
                data: {
                    numero: data.numero,
                    valorBase: data.valorBase,
                    climatizado: data.climatizado,
                    predioId: data.predioId,
                    status: StatusApartamento.VAGO
                }
            });

            return newApartamento;

        } catch (error: any) {
            throw new Error('Erro ao cadastrar apartamento: ' + error.message);
        }
    }

    async getApartamentos() {
        const apartamentos = await prismaClient.apartamento.findMany({
            orderBy: { numero: "asc" },
            include: {
                predio: true
            }
        });
        return apartamentos;
    }

    async getApartamentosByPredioId(predioId: string) {
        const predioExist = await prismaClient.predio.findUnique({ where: { id: predioId } });

        if (!predioExist) throw new Error('Prédio não encontrado.');

        const apartamentos = await prismaClient.apartamento.findMany({
            where: { predioId: predioId },
            orderBy: { numero: "asc" },
            include: {
                contratos: {
                    where: { status: 'ATIVO' },
                    select: { id: true }
                }
            }
        });
        return apartamentos;
    }

    async getApartamentoById(apartamentoId: string) {
        const apartamento = await prismaClient.apartamento.findUnique({
            where: { id: apartamentoId },
            include: {
                predio: true,
                contratos: {
                    where: { status: { in: ['ATIVO', 'AGUARDANDO_ASSINATURA'] } },
                    include: { cliente: true },
                    take: 1
                }
            }
        });

        if (!apartamento) throw new Error('Apartamento não encontrado.');

        return apartamento;
    }

    async updateApartamento(apartamentoId: string, data: { climatizado?: boolean, valorBase?: number, status?: StatusApartamento, numero?: string }) {

        const existingApartamento = await prismaClient.apartamento.findUnique({ where: { id: apartamentoId } });

        if (!existingApartamento) throw new Error('Apartamento não encontrado.');

        if (data.status && data.status !== existingApartamento.status) {
            const contratoAtivo = await prismaClient.contrato.findFirst({
                where: { apartamentoId, status: { in: ['ATIVO', 'AGUARDANDO_ASSINATURA'] } }
            });
            if (contratoAtivo) {
                throw new Error('Este apartamento possui um contrato ativo. Use as ações de renovar/transferir/cancelar contrato para alterar sua ocupação.');
            }
        }

        await prismaClient.apartamento.update({
            where: { id: apartamentoId },
            data: {
                climatizado: data.climatizado,
                valorBase: data.valorBase,
                status: data.status,
                numero: data.numero
            }
        });

        return;
    }

    async deleteApartamento(apartamentoId: string) {
        const existingApartamento = await prismaClient.apartamento.findUnique({ where: { id: apartamentoId } });

        if (!existingApartamento) throw new Error('Apartamento não encontrado.');

        await prismaClient.apartamento.delete({ where: { id: apartamentoId } });

        return;
    }
}

export default ApartamentoService;