import { Request, Response } from "express";
import FaturaService from "../services/faturaService";

const faturaService = new FaturaService();

class FaturaController {

    async lancarLeitura(req: Request, res: Response) {
        try {
            if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Acesso negado.' });

            const { faturaId } = req.params;
            const { leituraAtual } = req.body;
            const file = req.file;

            if (!faturaId || leituraAtual === undefined) {
                return res.status(400).json({ message: 'ID e Leitura são obrigatórios.' });
            }

            const result = await faturaService.lancarLeitura(faturaId, Number(leituraAtual), file);
            res.status(200).json(result);

        } catch (error: any) {
            res.status(500).json({ message: error.message });
        }
    }

    async editarValores(req: Request, res: Response) {
        try {
            if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Acesso negado.' });

            const { faturaId } = req.params;
            const { multa, acrescimo, desconto, observacao } = req.body;

            const updated = await faturaService.editarValoresManuais(
                faturaId,
                Number(multa || 0),
                Number(acrescimo || 0),
                Number(desconto || 0),
                observacao || ''
            );

            res.status(200).json(updated);

        } catch (error: any) {
            res.status(500).json({ message: error.message });
        }
    }

    async enviarComprovante(req: Request, res: Response) {
        try {
            const { faturaId } = req.params;
            const file = req.file;

            if (!faturaId) return res.status(400).json({ message: 'ID da fatura obrigatório.' });
            if (!file) return res.status(400).json({ message: 'Arquivo obrigatório.' });

            const result = await faturaService.enviarComprovante(faturaId, file);
            res.status(200).json(result);

        } catch (error: any) {
            res.status(500).json({ message: error.message });
        }
    }

    async aprovarPagamento(req: Request, res: Response) {
        try {
            if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Acesso negado.' });

            const { faturaId } = req.params;
            await faturaService.aprovarPagamento(faturaId);

            res.status(200).json({ message: 'Pagamento aprovado.' });

        } catch (error: any) {
            res.status(500).json({ message: error.message });
        }
    }

    async reprovarPagamento(req: Request, res: Response) {
        try {
            if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Acesso negado.' });

            const { faturaId } = req.params;
            const { motivo } = req.body;

            await faturaService.reprovarPagamento(faturaId, motivo || 'Comprovante inválido');

            res.status(200).json({ message: 'Pagamento reprovado.' });

        } catch (error: any) {
            res.status(500).json({ message: error.message });
        }
    }

    async getPix(req: Request, res: Response) {
        try {
            const { faturaId } = req.params;
            const pix = await faturaService.gerarPix(faturaId);
            res.status(200).json(pix);
        } catch (error: any) {
            res.status(500).json({ message: error.message });
        }
    }

    async getAllFaturas(req: Request, res: Response) {
        try {
            if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Acesso negado.' });
            const faturas = await faturaService.getAllFaturasAdmin();
            res.json(faturas);
        } catch (error: any) {
            res.status(500).json({ message: error.message });
        }
    }

    async getFaturaById(req: Request, res: Response) {
        try {
            const { faturaId } = req.params;
            const fatura = await faturaService.getFaturaById(faturaId);
            res.json(fatura);
        } catch (error: any) {
            res.status(500).json({ message: error.message });
        }
    }
}

export default FaturaController;