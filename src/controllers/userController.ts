import { Request, Response } from "express";
import UserService from "../services/userService"; // Atenção ao Case Sensitive do arquivo

const userService = new UserService();

class UserController {

    async createAdmin(req: Request, res: Response) {
        try {
            if (req.user.role !== 'ADMIN') {
                return res.status(403).json({ message: 'Sem permissão.' });
            }

            const { email, password, confirmPassword } = req.body;

            if (!email || !password || !confirmPassword) {
                return res.status(400).json({ message: 'Dados incompletos.' });
            }

            userService.validatePassword(password, confirmPassword);

            const admin = await userService.createAdmin(email, password);
            return res.status(201).json(admin);

        } catch (error: any) {
            return res.status(500).json({ message: error.message });
        }
    }

    async getAllUsers(req: Request, res: Response) {
        try {
            if (req.user.role !== 'ADMIN') {
                return res.status(403).json({ message: 'Sem permissão.' });
            }
            const users = await userService.getAllUsers();
            return res.json(users);
        } catch (error: any) {
            return res.status(500).json({ message: error.message });
        }
    }

    async getLoggedUserInfo(req: Request, res: Response) {
        try {
            const user = await userService.getLoggedUserInfo(req.user.id);
            return res.json(user);
        } catch (error: any) {
            return res.status(400).json({ message: error.message });
        }
    }

    async getUserById(req: Request, res: Response) {
        try {
            const userId = req.params.userId;

            if (req.user.role !== 'ADMIN' && req.user.id !== userId) {
                return res.status(403).json({ message: 'Sem permissão.' });
            }

            const user = await userService.getUserById(userId);
            return res.json(user);
        } catch (error: any) {
            return res.status(400).json({ message: error.message });
        }
    }

    async updateMyPassword(req: Request, res: Response) {
        try {
            const { currentPassword, newPassword, confirmPassword } = req.body;

            userService.validatePassword(newPassword, confirmPassword);

            const result = await userService.updateUserPassword(req.user.id, currentPassword, newPassword);
            return res.json(result);
        } catch (error: any) {
            return res.status(400).json({ message: error.message });
        }
    }

    async adminResetClientPassword(req: Request, res: Response) {
        try {
            if (req.user.role !== 'ADMIN') {
                return res.status(403).json({ message: 'Sem permissão.' });
            }

            const { clientId } = req.params;
            const { newPassword, confirmPassword } = req.body;

            userService.validatePassword(newPassword, confirmPassword);

            const result = await userService.resetClientPassword(clientId, newPassword);
            return res.json(result);

        } catch (error: any) {
            return res.status(400).json({ message: error.message });
        }
    }

    async deleteUser(req: Request, res: Response) {
        try {
            if (req.user.role !== 'ADMIN') {
                return res.status(403).json({ message: 'Sem permissão.' });
            }

            const { userId } = req.params;
            await userService.deleteUserById(userId);

            return res.json({ message: 'Usuário removido.' });
        } catch (error: any) {
            return res.status(400).json({ message: error.message });
        }
    }
}

export default UserController;