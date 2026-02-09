import { Request, Response } from "express";
import ContratoService from "../services/contratoService";
import { gerarContratoPDF } from "../functions/gerarContratoPDF";

const contratoService = new ContratoService();

class ContratoController {

    async solicitarContrato(req: Request, res: Response) {
        try {
            const { aptId, dataInicio, duracaoMeses, diaVencimentoAluguel } = req.body;

            if (!aptId || !dataInicio || !duracaoMeses) {
                return res.status(400).json({ message: 'Dados incompletos. Informe aptId, dataInicio e duracaoMeses.' });
            }

            if (duracaoMeses < 6) {
                return res.status(400).json({ message: 'A duração mínima do contrato é de 6 meses.' });
            }

            const contrato = await contratoService.solicitarContrato(
                req.user.id,
                aptId,
                dataInicio,
                Number(duracaoMeses),
                Number(diaVencimentoAluguel)
            );

            res.status(201).json(contrato);
        } catch (error: any) {
            res.status(500).json({ message: error.message });
        }
    }

    async configurarContrato(req: Request, res: Response) {
        try {
            if (req.user.role !== 'ADMIN') {
                return res.status(403).json({ message: 'Apenas administradores podem configurar contratos.' });
            }

            const { contratoId, valorAluguel, diaVencimento, leituraInicial, limiteKwhIsento } = req.body;

            if (!contratoId || !valorAluguel || !diaVencimento) {
                return res.status(400).json({ message: 'Dados obrigatórios faltando (ID, Valor, Dia Vencimento).' });
            }

            const contrato = await contratoService.configurarContrato(
                contratoId,
                Number(valorAluguel),
                Number(diaVencimento),
                Number(leituraInicial || 0),
                Number(limiteKwhIsento || 0)
            );

            res.status(200).json(contrato);
        } catch (error: any) {
            res.status(500).json({ message: error.message });
        }
    }

    async reprovarContrato(req: Request, res: Response) {
        try {
            if (req.user.role !== 'ADMIN') {
                return res.status(403).json({ message: 'Acesso negado.' });
            }

            const { contratoId } = req.params;
            const { motivo } = req.body;
            if (!contratoId) return res.status(400).json({ message: 'ID faltando.' });

            await contratoService.reprovarContrato(contratoId, motivo || "Motivo não especificado.");
            res.json({ message: 'Contrato reprovado com sucesso.' });

        } catch (error: any) {
            res.status(500).json({ message: error.message });
        }
    }

    async assinarContrato(req: Request, res: Response) {
        try {
            const contratoId = req.params.contratoId;
            const file = req.file;

            if (!contratoId) return res.status(400).json({ message: 'ID do contrato faltando.' });
            if (!file) return res.status(400).json({ message: 'Arquivo PDF assinado é obrigatório.' });

            const result = await contratoService.assinarContrato(contratoId, file);
            res.status(200).json(result);

        } catch (error: any) {
            console.error(error);
            res.status(500).json({ message: error.message });
        }
    }

    async cancelarContrato(req: Request, res: Response) {
        try {
            if (req.user.role !== 'ADMIN') {
                return res.status(403).json({ message: 'Permissão negada.' });
            }

            const { contratoId, motivo } = req.body;

            if (!contratoId || !motivo) {
                return res.status(400).json({ message: 'ContratoID e Motivo são obrigatórios.' });
            }

            await contratoService.cancelarContrato(contratoId, motivo);
            res.status(200).json({ message: 'Contrato cancelado/encerrado com sucesso.' });

        } catch (error: any) {
            res.status(500).json({ message: error.message });
        }
    }

    async getContratos(req: Request, res: Response) {
        try {
            if (req.user.role !== 'ADMIN') {
                return res.status(403).json({ message: 'Permissão negada.' });
            }
            const contratos = await contratoService.getAllContratos();
            res.json(contratos);
        } catch (error: any) {
            res.status(500).json({ message: error.message });
        }
    }

    async getContratoById(req: Request, res: Response) {
        try {
            const contratoId = req.params.contratoId;
            const contrato = await contratoService.getContratoById(contratoId, req.user.id, req.user.role);
            res.json(contrato);
        } catch (error: any) {
            res.status(403).json({ message: error.message });
        }
    }

    async getMeusContratos(req: Request, res: Response) {
        try {
            const contratos = await contratoService.getContratosByCliente(req.user.id);
            res.json(contratos);
        } catch (error: any) {
            res.status(500).json({ message: error.message });
        }
    }

    async downloadContratoPDF(req: Request, res: Response) {
        try {
            const contratoId = req.params.contratoId;
            if (!contratoId) return res.status(400).json({ message: 'ID faltando' });

            res.writeHead(200, {
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'attachment; filename=contrato.pdf',
            });

            await gerarContratoPDF(
                contratoId,
                req.user.id,
                (data: any) => res.write(data),
                () => res.end()
            );

        } catch (error: any) {
            console.error(error);
            if (!res.headersSent) res.status(500).json({ message: error.message });
        }
    }
}

export default ContratoController;