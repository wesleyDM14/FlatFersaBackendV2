import { Request, Response } from "express";
import AvisoService from "../services/avisoServices";
import { TipoAviso } from "@prisma/client";

const avisoService = new AvisoService();

class AvisoController {

    async enviarAvisoGeral(req: Request, res: Response) {
        try {
            if (req.user.role !== 'ADMIN') {
                return res.status(403).json({ message: 'Acesso negado.' });
            }

            const { titulo, conteudo, tipo } = req.body;

            if (!titulo || !conteudo) {
                return res.status(400).json({ message: 'Título e conteúdo são obrigatórios.' });
            }

            const tipoAviso = (tipo && Object.values(TipoAviso).includes(tipo)) ? tipo : TipoAviso.GERAL;

            const result = await avisoService.createAvisoGeral(titulo, conteudo, tipoAviso);
            res.status(201).json(result);

        } catch (error: any) {
            res.status(500).json({ message: error.message });
        }
    }

    async enviarAvisoIndividual(req: Request, res: Response) {
        try {
            if (req.user.role !== 'ADMIN') {
                return res.status(403).json({ message: 'Acesso negado.' });
            }

            const { userId, titulo, conteudo, tipo } = req.body;

            if (!userId || !titulo || !conteudo) {
                return res.status(400).json({ message: 'Dados incompletos.' });
            }

            const tipoAviso = (tipo && Object.values(TipoAviso).includes(tipo)) ? tipo : TipoAviso.GERAL;

            const aviso = await avisoService.createAvisoIndividual(userId, titulo, conteudo, tipoAviso);
            res.status(201).json(aviso);

        } catch (error: any) {
            res.status(500).json({ message: error.message });
        }
    }

    async getMeusAvisos(req: Request, res: Response) {
        try {
            const avisos = await avisoService.getAvisosByUserId(req.user.id);
            res.json(avisos);
        } catch (error: any) {
            res.status(500).json({ message: error.message });
        }
    }

    async marcarComoLido(req: Request, res: Response) {
        try {
            const { avisoId } = req.params;
            await avisoService.markAsRead(avisoId, req.user.id);
            res.json({ message: 'Aviso marcado como lido.' });
        } catch (error: any) {
            res.status(500).json({ message: error.message });
        }
    }

    async deleteAviso(req: Request, res: Response) {
        try {
            const { avisoId } = req.params;
            await avisoService.deleteAviso(avisoId, req.user.id, req.user.role);
            res.json({ message: 'Aviso deletado.' });
        } catch (error: any) {
            res.status(500).json({ message: error.message });
        }
    }
}

export default AvisoController;