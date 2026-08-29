import prismaClient from "../prisma";
import { compare, hash } from "bcryptjs";
import { sign } from "jsonwebtoken";
import axios from 'axios';
import fs from 'fs';

import getToken from "../functions/getToken";
import { StatusCadastro, Role, TipoAviso } from "@prisma/client";
import { EmailService } from "../functions/emailService";
import { EmailTemplates } from "../functions/email-templates";

const emailService = new EmailService();

export const generateAccessToken = (userID: string, role: string): string => {
    return sign(
        { id: userID, role: role },
        process.env.JWT_SECRET as string
    );
}

export const authenticateUser = async (email: string, password: string) => {
    try {
        const user = await prismaClient.user.findUnique({
            where: { email: email },
            include: { cliente: true }
        });

        if (!user) {
            return null;
        }

        if (user.role === Role.INQUILINO && user.cliente) {
            if (user.cliente.statusCadastro === StatusCadastro.PENDENTE_APROVACAO) {
                throw new Error("Seu cadastro está em análise. Aguarde o e-mail de aprovação.");
            }
            if (user.cliente.statusCadastro === StatusCadastro.REPROVADO) {
                throw new Error(`Cadastro reprovado. Motivo: ${user.cliente.motivoReprovacao}`);
            }
            if (user.cliente.statusCadastro === StatusCadastro.BLOQUEADO) {
                throw new Error("Conta bloqueada. Entre em contato com a administração.");
            }
        }

        const passwordMatch = await compare(password, user.password);
        if (!passwordMatch) {
            return null;
        }

        const accessToken = generateAccessToken(user.id, user.role);

        return {
            accessToken,
            role: user.role,
            userId: user.id,
            name: user.cliente?.nome || "Administrador",
            status: user.cliente?.statusCadastro || "ATIVO"
        };

    } catch (error: any) {
        if (error.message) throw error;
        throw new Error('Erro interno ao autenticar usuário');
    }
}

export const solicitarAcessoCliente = async (
    name: string, cpf: string, rg: string, dateBirth: Date,
    phone: string, address: string,
    documentoFrente: Express.Multer.File,
    documentoVerso: Express.Multer.File,
    email: string
) => {
    try {
        const existingUser = await prismaClient.user.findUnique({ where: { email } });
        if (existingUser) throw new Error('Este email já está cadastrado.');

        const existingCpf = await prismaClient.cliente.findUnique({ where: { cpf } });
        if (existingCpf) throw new Error('CPF já cadastrado.');

        const uploadedFiles: string[] = [];

        if (documentoFrente && documentoVerso) {
            const token = await getToken();
            try {
                const formFrente = fs.createReadStream(documentoFrente.path);
                const resFrente = await axios.post(
                    `${process.env.WORDPRESS_URL}/wp-json/wp/v2/media`,
                    formFrente,
                    {
                        headers: {
                            'Content-Disposition': `attachment; filename="${documentoFrente.originalname}"`,
                            'Content-Type': documentoFrente.mimetype,
                            'Authorization': `Bearer ${token}`
                        }
                    }
                );
                fs.unlinkSync(documentoFrente.path);
                uploadedFiles.push(resFrente.data.source_url);

                const formVerso = fs.createReadStream(documentoVerso.path);
                const resVerso = await axios.post(
                    `${process.env.WORDPRESS_URL}/wp-json/wp/v2/media`,
                    formVerso,
                    {
                        headers: {
                            'Content-Disposition': `attachment; filename="${documentoVerso.originalname}"`,
                            'Content-Type': documentoVerso.mimetype,
                            'Authorization': `Bearer ${token}`
                        }
                    }
                );
                fs.unlinkSync(documentoVerso.path);
                uploadedFiles.push(resVerso.data.source_url);

            } catch (err: any) {
                if (fs.existsSync(documentoFrente.path)) fs.unlinkSync(documentoFrente.path);
                if (fs.existsSync(documentoVerso.path)) fs.unlinkSync(documentoVerso.path);
                throw new Error('Falha ao enviar documentos para o servidor de arquivos.');
            }
        } else {
            throw new Error('Documentos (Frente e Verso) são obrigatórios.');
        }

        const passwordHash = await hash(cpf, 8);

        const newUser = await prismaClient.user.create({
            data: {
                email: email,
                password: passwordHash,
                role: Role.INQUILINO,
                cliente: {
                    create: {
                        nome: name,
                        cpf: cpf,
                        rg: rg,
                        dataNascimento: dateBirth,
                        telefone: phone,
                        enderecoAtual: address,
                        docFrenteUrl: uploadedFiles[0],
                        docVersoUrl: uploadedFiles[1],
                        statusCadastro: StatusCadastro.PENDENTE_APROVACAO
                    }
                }
            },
            include: { cliente: true }
        });

        await emailService.sendEmail({
            to: email,
            subject: '📨 Solicitação Recebida - Em Análise',
            html: EmailTemplates.SOLICITACAO_RECEBIDA(name),
        });

        await emailService.sendEmail({
            to: process.env.ADMIN_EMAIL as string,
            subject: '⚠️ Nova Solicitação de Cadastro',
            html: EmailTemplates.NOVA_SOLICITACAO_ADMIN(name),
        });

        return { cliente: newUser.cliente };

    } catch (error: any) {
        throw new Error(error.message || 'Erro na solicitação de cadastro.');
    }
}

export const aprovarAcessoCliente = async (clienteId: string) => {
    try {
        const cliente = await prismaClient.cliente.findUnique({
            where: { id: clienteId },
            include: { user: true }
        });

        if (!cliente) throw new Error('Cliente não encontrado.');

        if (cliente.statusCadastro === StatusCadastro.APROVADO) {
            throw new Error('Este cliente já está aprovado.');
        }

        await prismaClient.cliente.update({
            where: { id: clienteId },
            data: { statusCadastro: StatusCadastro.APROVADO }
        });

        await prismaClient.avisos.create({
            data: {
                userId: cliente.user.id,
                titulo: 'Cadastro Aprovado',
                conteudo: 'Seu cadastro foi aprovado! Você já pode acessar a plataforma normalmente.',
                tipo: TipoAviso.SISTEMA
            }
        });

        await emailService.sendEmail({
            to: cliente.user.email,
            subject: '✅ Acesso Liberado!',
            html: EmailTemplates.ACESSO_LIBERADO(
                cliente.nome,
                cliente.user.email,
                'https://app.flatfersa.com/login'
            ),
        });

        return { message: "Cliente aprovado com sucesso." };

    } catch (error: any) {
        throw new Error('Erro ao aprovar: ' + error.message);
    }
}

export const reprovarAcessoCliente = async (clienteId: string, motivo: string) => {
    try {
        const cliente = await prismaClient.cliente.findUnique({ where: { id: clienteId }, include: { user: true } });

        if (!cliente) throw new Error('Cliente não encontrado.');

        const motivoFinal = motivo || "Documentação inconsistente";

        await prismaClient.cliente.update({
            where: { id: clienteId },
            data: {
                statusCadastro: StatusCadastro.REPROVADO,
                motivoReprovacao: motivoFinal
            }
        });

        await prismaClient.avisos.create({
            data: {
                userId: cliente.user.id,
                titulo: 'Cadastro Reprovado',
                conteudo: `Seu cadastro não foi aprovado. Motivo: ${motivoFinal}`,
                tipo: TipoAviso.SISTEMA
            }
        });

        await emailService.sendEmail({
            to: cliente.user.email,
            subject: 'Atualização sobre seu Cadastro',
            html: EmailTemplates.CLIENTE_CADASTRO_REPROVADO(cliente.nome, motivoFinal)
        });

        return { message: "Cliente reprovado." };
    } catch (error: any) {
        throw new Error('Erro ao reprovar: ' + error.message);
    }
}