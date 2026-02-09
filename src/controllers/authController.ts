import { Request, Response } from "express";
import { aprovarAcessoCliente, authenticateUser, reprovarAcessoCliente, solicitarAcessoCliente } from "../services/authService";

export const AuthController = {
    async login(req: Request, res: Response) {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({ message: 'Email e Senha são obrigatórios' });
            }

            const authData = await authenticateUser(email, password);

            if (!authData) {
                return res.status(401).json({ message: 'Credenciais inválidas ou conta pendente.' });
            }

            return res.status(200).json(authData);

        } catch (error: any) {
            console.error('Erro ao fazer login: ', error);
            const status = error.message.includes('bloqueada') || error.message.includes('análise') ? 403 : 500;
            return res.status(status).json({ message: error.message });
        }
    },

    async requestAccess(req: Request, res: Response) {

        try {
            const files = req.files as { [fieldname: string]: Express.Multer.File[] };
            const documentFront = files['documentFront'];
            const documentBack = files['documentBack'];

            const { name, cpf, rg, dateBirth, phone, address, email } = req.body;

            if (!name || !cpf || !rg || !dateBirth || !phone || !email || !documentBack || !documentFront) {
                return res.status(400).json({ message: 'Dados faltando para criação de cliente.' });
            }

            const dateBirthObj = new Date(dateBirth);

            const newClient = await solicitarAcessoCliente(
                name,
                cpf,
                rg,
                dateBirthObj,
                phone,
                address,
                documentFront[0],
                documentBack[0],
                email
            );

            res.status(201).json(newClient);

        } catch (error: any) {
            console.error('Erro ao fazer solicitação: ', error);
            return res.status(500).json({ message: error.message });
        }
    },

    async aproveAccess(req: Request, res: Response) {
        try {
            if (req.user.role !== 'ADMIN') {
                return res.status(403).json({ message: 'Acesso negado. Apenas administradores.' });
            }

            const { clientId } = req.body;

            if (!clientId) {
                return res.status(400).json({ message: 'ID não fornecido.' });
            }

            const result = await aprovarAcessoCliente(clientId);
            res.status(200).json(result);

        } catch (error: any) {
            console.error('Erro ao aprovar solicitação: ', error);
            return res.status(500).json({ message: error.message });
        }
    },

    async reproveAccess(req: Request, res: Response) {
        try {
            if (req.user.role !== 'ADMIN') {
                return res.status(403).json({ message: 'Acesso negado. Apenas administradores.' });
            }

            const { clientId, motivo } = req.body;

            if (!clientId) {
                return res.status(400).json({ message: 'ID não fornecido.' });
            }

            await reprovarAcessoCliente(clientId, motivo);
            res.status(200).json({ message: 'Cliente reprovado com sucesso.' });

        } catch (error: any) {
            console.error('Erro ao Reprovar solicitação: ', error);
            return res.status(500).json({ message: error.message });
        }
    }
}