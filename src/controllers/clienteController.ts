import { Request, Response } from "express";
import ClienteService from "../services/clienteService";

const clienteService = new ClienteService();

class ClienteController {

    async createClient(req: Request, res: Response) {
        try {
            if (req.user.role !== 'ADMIN') {
                return res.status(403).json({ message: 'Apenas administradores podem cadastrar clientes manualmente.' });
            }

            const files = req.files as { [fieldname: string]: Express.Multer.File[] };
            const documentFront = files?.['documentFront']?.[0];
            const documentBack = files?.['documentBack']?.[0];

            const { name, cpf, rg, dateBirth, phone, address, email } = req.body;

            if (!name || !cpf || !rg || !dateBirth || !phone || !email || !documentFront || !documentBack) {
                return res.status(400).json({ message: 'Todos os dados e documentos são obrigatórios.' });
            }

            const newClient = await clienteService.createClient(
                name, cpf, rg, new Date(dateBirth), phone, address,
                documentFront, documentBack, email
            );

            res.status(201).json(newClient);
        } catch (error: any) {
            console.error(error);
            res.status(500).json({ message: error.message });
        }
    }

    async getAllClients(req: Request, res: Response) {
        try {
            if (req.user.role !== 'ADMIN') {
                return res.status(403).json({ message: 'Acesso negado.' });
            }
            const clientes = await clienteService.getAllClients();
            res.json(clientes);
        } catch (error: any) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao obter clientes: ' + error.message });
        }
    }

    async getClientById(req: Request, res: Response) {
        try {
            const clientId = req.params.clientId;

            if (!clientId) {
                return res.status(400).json({ message: 'ID não fornecido.' });
            }

            const client = await clienteService.getClientById(clientId, req.user.id, req.user.role);
            res.json(client);
        } catch (error: any) {
            console.error(error);
            res.status(500).json({ message: error.message });
        }
    }

    async updateClient(req: Request, res: Response) {
        try {
            const clientId = req.params.clientId;

            if (!clientId) {
                return res.status(400).json({ message: 'ID não fornecido.' });
            }

            const files = req.files as { [fieldname: string]: Express.Multer.File[] };
            const documentFront = files?.documentFront ? files.documentFront[0] : undefined;
            const documentBack = files?.documentBack ? files.documentBack[0] : undefined;

            const { name, cpf, rg, dateBirth, phone, address } = req.body;

            await clienteService.updateClient(
                clientId,
                req.user.id,
                req.user.role,
                name, cpf, rg,
                new Date(dateBirth),
                phone, address,
                documentFront, documentBack
            );

            res.json({ message: 'Cliente atualizado com sucesso.' });
        } catch (error: any) {
            console.error(error);
            res.status(400).json({ message: error.message });
        }
    }

    async deleteClient(req: Request, res: Response) {
        try {
            if (req.user.role !== 'ADMIN') {
                return res.status(403).json({ message: 'Apenas administradores podem deletar clientes.' });
            }

            const clientId = req.params.clientId;

            if (!clientId) {
                return res.status(400).json({ message: 'ID não fornecido.' });
            }

            await clienteService.deleteClient(clientId);
            res.json({ message: 'Cliente deletado com sucesso.' });
        } catch (error: any) {
            console.error(error);
            res.status(400).json({ message: error.message });
        }
    }

    async getDocumentoFrente(req: Request, res: Response) {
        try {
            const clientId = req.params.clientId;
            if (!clientId) return res.status(400).json({ message: 'ID obrigatório.' });

            const { stream, contentType, fileName } = await clienteService.getDocumentFrente(clientId);

            res.setHeader("Content-Type", contentType);
            res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
            stream.pipe(res);
        } catch (error: any) {
            console.error(error);
            res.status(400).json({ message: error.message });
        }
    }

    async getDocumentoVerso(req: Request, res: Response) {
        try {
            const clientId = req.params.clientId;
            if (!clientId) return res.status(400).json({ message: 'ID obrigatório.' });

            const { stream, contentType, fileName } = await clienteService.getDocumentVerso(clientId);

            res.setHeader("Content-Type", contentType);
            res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
            stream.pipe(res);
        } catch (error: any) {
            console.error(error);
            res.status(400).json({ message: error.message });
        }
    }
}

export default ClienteController;