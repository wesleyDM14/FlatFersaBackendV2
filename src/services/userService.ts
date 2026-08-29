import prismaClient from "../prisma";
import { hash, compare } from "bcryptjs";
import { Role } from "@prisma/client";

class UserService {

    validatePassword(password: string, confirmPassword: string): void {
        if (password !== confirmPassword) {
            throw new Error('As senhas não coincidem.');
        }
        if (password.length < 6) {
            throw new Error('A senha deve ter pelo menos 6 caracteres.');
        }
    }

    async createAdmin(email: string, password: string) {
        try {
            const existingUser = await prismaClient.user.findUnique({
                where: { email: email }
            });

            if (existingUser) {
                throw new Error('O email já está em uso.');
            }

            const passwordHash = await hash(password, 8);

            const newAdmin = await prismaClient.user.create({
                data: {
                    email: email,
                    password: passwordHash,
                    role: Role.ADMIN
                },
                select: {
                    id: true,
                    email: true,
                    role: true,
                    createdAt: true
                }
            });

            return newAdmin;

        } catch (error: any) {
            throw new Error('Erro ao criar administrador: ' + error.message);
        }
    }

    async getAllUsers() {
        const users = await prismaClient.user.findMany({
            select: {
                id: true,
                email: true,
                role: true,
                createdAt: true,
                cliente: {
                    select: { nome: true, statusCadastro: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        return users;
    }

    async getLoggedUserInfo(userId: string) {
        const user = await prismaClient.user.findUnique({
            where: { id: userId },
            include: { cliente: true }
        });

        if (!user) throw new Error('Usuário não encontrado.');

        if (user.role === Role.ADMIN) {
            return {
                id: user.id,
                email: user.email,
                name: "Administrador",
                role: "ADMIN",
                avatar: null
            };
        }

        return {
            id: user.id,
            email: user.email,
            role: "INQUILINO",
            name: user.cliente?.nome || "Usuário",
            phone: user.cliente?.telefone || '',
            address: user.cliente?.enderecoAtual || '',
            status: user.cliente?.statusCadastro,
            avatar: user.cliente?.fotoRostoUrl || null
        };
    }

    async getUserById(userId: string) {
        const user = await prismaClient.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                role: true,
                cliente: true
            }
        });

        if (!user) throw new Error('Usuário não encontrado.');
        return user;
    }

    async updateUserPassword(userId: string, currentPassword: string, novaSenha: string) {
        const user = await prismaClient.user.findUnique({ where: { id: userId } });
        if (!user) throw new Error('Usuário não encontrado.');

        const passwordMatch = await compare(currentPassword, user.password);
        if (!passwordMatch) throw new Error('Senha atual incorreta.');

        const passwordHash = await hash(novaSenha, 8);

        await prismaClient.user.update({
            where: { id: userId },
            data: { password: passwordHash }
        });

        return { message: "Senha alterada com sucesso." };
    }

    async resetClientPassword(clientId: string, novaSenha: string) {
        const cliente = await prismaClient.cliente.findUnique({ where: { id: clientId } });
        if (!cliente) throw new Error('Cliente não encontrado.');

        const passwordHash = await hash(novaSenha, 8);

        await prismaClient.user.update({
            where: { id: cliente.userId },
            data: { password: passwordHash }
        });

        return { message: "Senha resetada com sucesso." };
    }

    async updateMyProfile(userId: string, dados: { name?: string; phone?: string; address?: string }) {
        const user = await prismaClient.user.findUnique({ where: { id: userId }, include: { cliente: true } });
        if (!user) throw new Error('Usuário não encontrado.');

        if (!user.cliente) {
            return { message: 'Nada para atualizar.' };
        }

        await prismaClient.cliente.update({
            where: { id: user.cliente.id },
            data: {
                nome: dados.name || user.cliente.nome,
                telefone: dados.phone || user.cliente.telefone,
                enderecoAtual: dados.address ?? user.cliente.enderecoAtual
            }
        });

        return { message: 'Perfil atualizado com sucesso.' };
    }

    async deleteUserById(userId: string) {
        const user = await prismaClient.user.findUnique({ where: { id: userId }, include: { cliente: true } });
        if (!user) throw new Error('Usuário não encontrado.');

        if (user.cliente) {
            const contratoAtivo = await prismaClient.contrato.findFirst({
                where: { clienteId: user.cliente.id, status: { in: ['ATIVO', 'AGUARDANDO_ASSINATURA', 'SOLICITADO'] } }
            });
            if (contratoAtivo) {
                throw new Error('Não é possível excluir um usuário com contrato ativo ou em andamento.');
            }
        }

        await prismaClient.user.delete({ where: { id: userId } });
        return;
    }
}

export default UserService;