import prismaClient from "../prisma";
import axios from 'axios';
import fs from 'fs';
import { hash } from "bcryptjs";
import getToken from "../functions/getToken";
import { StatusCadastro, Role } from "@prisma/client";
import { EmailService } from "../functions/emailService";
import { EmailTemplates } from "../functions/email-templates";

const emailService = new EmailService();

class ClienteService {

    async createClient(name: string, cpf: string, rg: string, dateBirth: Date, phone: string, address: string, documentoFrente: Express.Multer.File, documentoVerso: Express.Multer.File, email: string) {
        try {
            const existingUser = await prismaClient.user.findUnique({ where: { email } });
            if (existingUser) throw new Error('Email já em uso.');

            const existingCpf = await prismaClient.cliente.findUnique({ where: { cpf } });
            if (existingCpf) throw new Error('CPF já cadastrado.');

            const uploadedFiles: string[] = [];
            const token = await getToken();

            if (documentoFrente && documentoVerso) {
                try {
                    // Frente
                    const resFrente = await axios.post(
                        `${process.env.WORDPRESS_URL}/wp-json/wp/v2/media`,
                        fs.createReadStream(documentoFrente.path),
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

                    // Verso
                    const resVerso = await axios.post(
                        `${process.env.WORDPRESS_URL}/wp-json/wp/v2/media`,
                        fs.createReadStream(documentoVerso.path),
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
                    throw new Error('Erro no upload de documentos: ' + err.message);
                }
            } else {
                throw new Error('Documentos são obrigatórios.');
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
                            dataNascimento: new Date(dateBirth),
                            telefone: phone,
                            enderecoAtual: address,
                            docFrenteUrl: uploadedFiles[0],
                            docVersoUrl: uploadedFiles[1],
                            statusCadastro: StatusCadastro.APROVADO
                        }
                    }
                },
                include: { cliente: true }
            });

            await emailService.sendEmail({
                to: email,
                subject: '✅ Cadastro Realizado com Sucesso!',
                html: EmailTemplates.ACESSO_LIBERADO(name, email, 'https://app.flatfersa.com/login'),
            });

            return newUser.cliente;

        } catch (error: any) {
            throw new Error('Erro ao criar cliente: ' + error.message);
        }
    }

    async getAllClients() {
        const clients = await prismaClient.cliente.findMany({
            include: {
                user: {
                    select: { email: true, role: true }
                }
            }
        });
        return clients;
    }

    async getClientById(clientId: string, userId: string, userRole: string) {

        const client = await prismaClient.cliente.findUnique({
            where: { id: clientId },
            include: { user: { select: { email: true } } }
        });

        if (!client) {
            throw new Error('Cliente não encontrado.');
        }

        if (client.userId !== userId && userRole !== Role.ADMIN) {
            throw new Error('Acesso negado.');
        }

        return client;
    }

    async updateClient(
        clientId: string, userId: string, userRole: string,
        name: string, cpf: string, rg: string, dateBirth: Date,
        phone: string, address: string,
        documentoFrente?: Express.Multer.File,
        documentoVerso?: Express.Multer.File
    ) {
        try {
            const clientExisting = await prismaClient.cliente.findUnique({ where: { id: clientId } });

            if (!clientExisting) throw new Error('Cliente não encontrado.');

            if (clientExisting.userId !== userId && userRole !== Role.ADMIN) {
                throw new Error('Sem permissão para alterar este cliente.');
            }

            let docFrenteUrl = clientExisting.docFrenteUrl;
            let docVersoUrl = clientExisting.docVersoUrl;
            const token = await getToken();

            if (documentoFrente) {
                try {
                    const resFront = await axios.post(
                        `${process.env.WORDPRESS_URL}/wp-json/wp/v2/media`,
                        fs.createReadStream(documentoFrente.path),
                        {
                            headers: {
                                'Content-Disposition': `attachment; filename="${documentoFrente.originalname}"`,
                                'Content-Type': documentoFrente.mimetype,
                                'Authorization': `Bearer ${token}`
                            }
                        }
                    );
                    fs.unlinkSync(documentoFrente.path);
                    docFrenteUrl = resFront.data.source_url;
                } catch (err: any) {
                    throw new Error('Erro update doc frente: ' + err.message);
                }
            }

            if (documentoVerso) {
                try {
                    const resBack = await axios.post(
                        `${process.env.WORDPRESS_URL}/wp-json/wp/v2/media`,
                        fs.createReadStream(documentoVerso.path),
                        {
                            headers: {
                                'Content-Disposition': `attachment; filename="${documentoVerso.originalname}"`,
                                'Content-Type': documentoVerso.mimetype,
                                'Authorization': `Bearer ${token}`
                            }
                        }
                    );
                    fs.unlinkSync(documentoVerso.path);
                    docVersoUrl = resBack.data.source_url;
                } catch (err: any) {
                    throw new Error('Erro update doc verso: ' + err.message);
                }
            }

            await prismaClient.cliente.update({
                where: { id: clientId },
                data: {
                    nome: name,
                    cpf: cpf,
                    rg: rg,
                    dataNascimento: new Date(dateBirth),
                    telefone: phone,
                    enderecoAtual: address,
                    docFrenteUrl: docFrenteUrl,
                    docVersoUrl: docVersoUrl,
                },
            });

            return { message: "Dados atualizados com sucesso" };

        } catch (error: any) {
            throw new Error('Erro ao atualizar: ' + error.message);
        }
    }

    async deleteClient(clientId: string) {
        const client = await prismaClient.cliente.findUnique({ where: { id: clientId } });

        if (!client) throw new Error('Cliente não encontrado.');

        const contratoAtivo = await prismaClient.contrato.findFirst({
            where: { clienteId: clientId, status: { in: ['ATIVO', 'AGUARDANDO_ASSINATURA', 'SOLICITADO'] } }
        });
        if (contratoAtivo) {
            throw new Error('Não é possível excluir um cliente com contrato ativo ou em andamento. Cancele o contrato primeiro.');
        }

        await prismaClient.user.delete({ where: { id: client.userId } });

        return;
    }

    async solicitarExclusao(userId: string) {
        const client = await prismaClient.cliente.findUnique({ where: { userId } });
        if (!client) throw new Error('Perfil de cliente não encontrado.');

        const contratoAtivo = await prismaClient.contrato.findFirst({
            where: { clienteId: client.id, status: { in: ['ATIVO', 'AGUARDANDO_ASSINATURA', 'SOLICITADO'] } }
        });
        if (contratoAtivo) {
            throw new Error('Não é possível excluir a conta enquanto houver um contrato ativo ou em andamento. Encerre o contrato primeiro.');
        }

        await prismaClient.cliente.update({
            where: { id: client.id },
            data: { exclusaoSolicitada: true, dataSolicitacaoExclusao: new Date(), motivoNegacaoExclusao: null }
        });

        const admins = await prismaClient.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
        if (admins.length > 0) {
            await prismaClient.avisos.createMany({
                data: admins.map(admin => ({
                    userId: admin.id,
                    titulo: 'Solicitação de Exclusão de Conta',
                    conteudo: `${client.nome} solicitou a exclusão da sua conta e dados pessoais.`,
                    tipo: 'SISTEMA' as const,
                }))
            });
        }

        return { message: 'Solicitação de exclusão registrada. Um administrador vai analisar seu pedido.' };
    }

    async aprovarExclusao(clientId: string) {
        const client = await prismaClient.cliente.findUnique({ where: { id: clientId } });
        if (!client) throw new Error('Cliente não encontrado.');
        if (!client.exclusaoSolicitada) throw new Error('Este cliente não solicitou exclusão de conta.');

        const contratoAtivo = await prismaClient.contrato.findFirst({
            where: { clienteId: clientId, status: { in: ['ATIVO', 'AGUARDANDO_ASSINATURA', 'SOLICITADO'] } }
        });
        if (contratoAtivo) {
            throw new Error('Não é possível excluir: o cliente passou a ter um contrato ativo desde a solicitação.');
        }

        // Anonimiza os dados pessoais em vez de apagar o registro: contratos e faturas
        // ja emitidos precisam ser preservados por obrigacao fiscal/contabil, mas nao
        // podem mais ficar associados a dados de identificacao direta do titular.
        const anonId = client.id.slice(0, 8);
        await prismaClient.cliente.update({
            where: { id: clientId },
            data: {
                nome: `Cliente Excluído (${anonId})`,
                cpf: `EXCLUIDO-${anonId}`,
                rg: null,
                dataNascimento: new Date(0),
                telefone: 'EXCLUIDO',
                enderecoAtual: null,
                docFrenteUrl: null,
                docVersoUrl: null,
                fotoRostoUrl: null,
                statusCadastro: 'BLOQUEADO',
                exclusaoSolicitada: false,
            }
        });

        await prismaClient.user.update({
            where: { id: client.userId },
            data: { email: `excluido-${anonId}@flatfersa.local`, password: await hash(`${Date.now()}${Math.random()}`, 10) }
        });

        return { message: 'Conta e dados pessoais anonimizados com sucesso.' };
    }

    async negarExclusao(clientId: string, motivo: string) {
        const client = await prismaClient.cliente.findUnique({ where: { id: clientId } });
        if (!client) throw new Error('Cliente não encontrado.');

        await prismaClient.cliente.update({
            where: { id: clientId },
            data: { exclusaoSolicitada: false, motivoNegacaoExclusao: motivo }
        });

        await prismaClient.avisos.create({
            data: {
                userId: client.userId,
                titulo: 'Solicitação de Exclusão Negada',
                conteudo: motivo || 'Sua solicitação de exclusão de conta foi analisada e não pôde ser atendida no momento.',
                tipo: 'SISTEMA',
            }
        });

        return { message: 'Solicitação de exclusão negada.' };
    }

    async getDocumentFrente(clientId: string) {
        const client = await prismaClient.cliente.findUnique({ where: { id: clientId } });

        if (!client || !client.docFrenteUrl) throw new Error("Documento não encontrado.");

        const token = await getToken();
        const response = await axios.get(client.docFrenteUrl, {
            responseType: "stream",
            headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'MyBackend' }
        });

        return {
            stream: response.data,
            contentType: response.headers["content-type"],
            fileName: "frente.jpg"
        }
    }

    async getDocumentVerso(clientId: string) {
        const client = await prismaClient.cliente.findUnique({ where: { id: clientId } });

        if (!client || !client.docVersoUrl) throw new Error("Documento não encontrado.");

        const token = await getToken();
        const response = await axios.get(client.docVersoUrl, {
            responseType: "stream",
            headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'MyBackend' }
        });

        return {
            stream: response.data,
            contentType: response.headers["content-type"],
            fileName: "verso.jpg"
        }
    }
}

export default ClienteService;