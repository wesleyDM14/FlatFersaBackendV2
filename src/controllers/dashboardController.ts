import { Request, Response } from "express";
import DashboardService from "../services/dashboardService";

const dashboardService = new DashboardService();

class DashboardController {

    async getDashboardAdmin(req: Request, res: Response) {
        try {
            if (req.user.role !== 'ADMIN') {
                return res.status(403).json({ message: 'Acesso negado.' });
            }

            const metrics = await dashboardService.getDashboardAdmin();
            return res.json(metrics);

        } catch (error: any) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao carregar dashboard: ' + error.message });
        }
    }

    async getDashboardClient(req: Request, res: Response) {
        try {
            const metrics = await dashboardService.getDashboardClient(req.user.id);
            return res.json(metrics);

        } catch (error: any) {
            console.error(error);
            const status = error.message.includes("não encontrado") ? 404 : 500;
            res.status(status).json({ message: error.message });
        }
    }
}

export default DashboardController;