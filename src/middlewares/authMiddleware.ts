import { NextFunction, Request, Response } from 'express';
import { verify } from 'jsonwebtoken';
import prismaClient from '../prisma';

interface Payload {
    id: string;
}

export const authenticateUser = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const authToken = req.headers.authorization;

    if (!authToken) {
        return res.status(401).json({ message: 'Token de acesso não fornecido' });
    }

    const [, token] = authToken.split(" ");

    try {
        const validation = verify(
            token,
            process.env.JWT_SECRET as string
        ) as Payload;

        try {
            const user = await prismaClient.user.findUnique({ where: { id: validation.id } });

            if (!user) {
                throw new Error('Usuário não encontrado.');
            }

            req.user = {
                id: user.id,
                role: user.role
            };

        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao verificar as permissões do usuário.' });
        }

        return next();
    } catch (err) {
        return res.status(401).json({ message: 'Token de Acesso Inválido' });
    }
};

export const isAdmin = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    if (!req.user || req.user.role !== 'ADMIN') {
        return res.status(403).json({ message: 'Acesso negado. Esta rota é restrita apenas para administradores.' });
    }
    return next();
}