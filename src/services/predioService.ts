import { FinalidadeEstabelecimento } from "@prisma/client";
import prismaClient from "../prisma";

interface CreatePredioData {
    nome: string;
    endereco: string;
    bairro: string;
    cidade: string;
    estado: string;
    precoKwhAtual: number;
    finalidade: FinalidadeEstabelecimento;
    diaVencimentoPadrao?: number;
}

class PredioService {

    async createPredio(data: CreatePredioData) {
        try {
            const newPredio = await prismaClient.predio.create({
                data: {
                    nome: data.nome,
                    endereco: data.endereco,
                    bairro: data.bairro,
                    cidade: data.cidade,
                    estado: data.estado,
                    precoKwhAtual: data.precoKwhAtual,
                    finalidade: data.finalidade,
                    diaVencimentoPadrao: data.diaVencimentoPadrao || 5
                }
            });

            return newPredio;
        } catch (error: any) {
            throw new Error('Erro ao cadastrar predio: ' + error.message);
        }
    }

    async getPredios() {
        const predios = await prismaClient.predio.findMany({
            include: {
                _count: {
                    select: { apartamentos: true }
                }
            }
        });
        return predios;
    }

    async getPredioById(predioId: string) {
        const predio = await prismaClient.predio.findUnique({
            where: { id: predioId },
            include: {
                apartamentos: true
            }
        });

        if (!predio) {
            throw new Error('Prédio não encontrado');
        }

        return predio;
    }

    async updatePredio(predioId: string, data: Partial<CreatePredioData>) {
        const existingPredio = await prismaClient.predio.findUnique({ where: { id: predioId } });

        if (!existingPredio) {
            throw new Error('Prédio não encontrado.');
        }

        await prismaClient.predio.update({
            where: { id: predioId },
            data: {
                nome: data.nome,
                endereco: data.endereco,
                bairro: data.bairro,
                cidade: data.cidade,
                estado: data.estado,
                precoKwhAtual: data.precoKwhAtual,
                finalidade: data.finalidade,
                diaVencimentoPadrao: data.diaVencimentoPadrao
            }
        });

        return;
    }

    async deletePredio(predioId: string) {
        const existingPredio = await prismaClient.predio.findUnique({ where: { id: predioId } });

        if (!existingPredio) {
            throw new Error('Prédio não encontrado.');
        }

        await prismaClient.predio.delete({ where: { id: predioId } });
        return;
    }
}

export default PredioService;