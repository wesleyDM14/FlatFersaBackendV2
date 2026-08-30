import { Request, Response } from "express";
import ChamadoManutencaoService from "../services/chamadoManutencaoService";

const chamadoManutencaoService = new ChamadoManutencaoService();

class ChamadoManutencaoController {

    async criarChamado(req: Request, res: Response) {
        try {
            const { titulo, descricao, prioridade } = req.body;
            if (!titulo || !descricao) {
                return res.status(400).json({ message: 'Título e descrição são obrigatórios.' });
            }

            const chamado = await chamadoManutencaoService.criarChamado(
                req.user.id,
                { titulo, descricao, prioridade },
                req.file
            );
            res.status(201).json(chamado);
        } catch (error: any) {
            res.status(400).json({ message: error.message });
        }
    }

    async getChamados(req: Request, res: Response) {
        try {
            if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Acesso negado.' });
            const chamados = await chamadoManutencaoService.getChamados();
            res.json(chamados);
        } catch (error: any) {
            res.status(500).json({ message: error.message });
        }
    }

    async getMeusChamados(req: Request, res: Response) {
        try {
            const chamados = await chamadoManutencaoService.getMeusChamados(req.user.id);
            res.json(chamados);
        } catch (error: any) {
            res.status(400).json({ message: error.message });
        }
    }

    async getChamadoById(req: Request, res: Response) {
        try {
            const { chamadoId } = req.params;
            const chamado = await chamadoManutencaoService.getChamadoById(chamadoId, req.user.id, req.user.role);
            res.json(chamado);
        } catch (error: any) {
            res.status(400).json({ message: error.message });
        }
    }

    async atualizarStatus(req: Request, res: Response) {
        try {
            if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Acesso negado.' });

            const { chamadoId } = req.params;
            const { status, respostaAdmin } = req.body;
            if (!status) return res.status(400).json({ message: 'Status é obrigatório.' });

            const atualizado = await chamadoManutencaoService.atualizarStatus(chamadoId, status, respostaAdmin);
            res.json(atualizado);
        } catch (error: any) {
            res.status(400).json({ message: error.message });
        }
    }
}

export default ChamadoManutencaoController;
