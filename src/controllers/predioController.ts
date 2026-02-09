import { Request, Response } from "express";
import PredioService from "../services/predioService"; // Atenção ao Case

const predioService = new PredioService();

class PredioController {

    async createPredio(req: Request, res: Response) {
        try {
            if (req.user.role !== 'ADMIN') {
                return res.status(403).json({ message: 'Apenas administradores podem cadastrar prédios.' });
            }

            const { endereco, bairro, cidade, estado, nome, precoKwhAtual, finalidade, diaVencimentoPadrao } = req.body;

            if (!nome) {
                return res.status(400).json({ message: 'Nome do prédio é obrigatório.' });
            }

            if (!endereco || !bairro || !cidade || !estado || !precoKwhAtual || !finalidade) {
                return res.status(400).json({ message: 'Dados obrigatórios faltando.' });
            }

            const newPredio = await predioService.createPredio({
                nome,
                endereco,
                bairro,
                cidade,
                estado,
                precoKwhAtual: Number(precoKwhAtual),
                finalidade,
                diaVencimentoPadrao: Number(diaVencimentoPadrao)
            });

            res.status(201).json(newPredio);
        } catch (error: any) {
            console.error(error);
            res.status(500).json({ message: error.message });
        }
    }

    async getPredios(req: Request, res: Response) {
        try {
            const predios = await predioService.getPredios();
            res.json(predios);
        } catch (error: any) {
            console.error(error);
            res.status(500).json({ message: error.message });
        }
    }

    async getPredioById(req: Request, res: Response) {
        try {
            if (req.user.role !== 'ADMIN') {
                return res.status(403).json({ message: 'Acesso negado.' });
            }

            const predioId = req.params.predioId;

            if (!predioId) {
                return res.status(400).json({ message: 'ID não fornecido.' });
            }

            const predio = await predioService.getPredioById(predioId);
            return res.json(predio)

        } catch (error: any) {
            console.error(error);
            res.status(500).json({ message: error.message });
        }
    }

    async updatePredio(req: Request, res: Response) {
        try {
            if (req.user.role !== 'ADMIN') {
                return res.status(403).json({ message: 'Acesso negado.' });
            }

            const predioId = req.params.predioId;
            const { endereco, bairro, cidade, estado, nome, precoKwhAtual, finalidade, diaVencimentoPadrao } = req.body;

            if (!predioId) {
                return res.status(400).json({ message: 'ID não fornecido.' });
            }

            await predioService.updatePredio(predioId, {
                nome,
                endereco,
                bairro,
                cidade,
                estado,
                precoKwhAtual: precoKwhAtual ? Number(precoKwhAtual) : undefined,
                finalidade,
                diaVencimentoPadrao: diaVencimentoPadrao ? Number(diaVencimentoPadrao) : undefined
            });

            return res.json({ message: 'Prédio atualizado com sucesso.' });

        } catch (error: any) {
            console.error(error);
            res.status(500).json({ message: error.message });
        }
    }

    async deletePredio(req: Request, res: Response) {
        try {
            if (req.user.role !== 'ADMIN') {
                return res.status(403).json({ message: 'Acesso negado.' });
            }

            const predioId = req.params.predioId;

            if (!predioId) {
                return res.status(400).json({ message: 'ID não fornecido.' });
            }

            await predioService.deletePredio(predioId);
            return res.json({ message: 'Prédio deletado com sucesso.' });

        } catch (error: any) {
            console.error(error);
            res.status(500).json({ message: error.message });
        }
    }
}

export default PredioController;