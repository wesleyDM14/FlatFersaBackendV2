import { Router } from 'express';
import multer from 'multer';

import { AuthController } from './controllers/authController';
import UserController from './controllers/userController';
import ClienteController from './controllers/clienteController';
import PredioController from './controllers/predioController';
import ApartamentoController from './controllers/apartamentoController';
import ContratoController from './controllers/contratoController';
import FaturaController from './controllers/faturaController';
import AvisoController from './controllers/avisoController';
import DashboardController from './controllers/dashboardController';

import { authenticateUser } from './middlewares/authMiddleware';

const router = Router();

const upload = multer({
    dest: './tmp',
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'image/jpeg',
            'image/pjpeg',
            'image/png',
            'application/pdf'
        ];

        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Tipo de arquivo inválido. Envie apenas PDF, JPG ou PNG."));
        }
    }
});

const userController = new UserController();
const clienteController = new ClienteController();
const predioController = new PredioController();
const apartamentoController = new ApartamentoController();
const contratoController = new ContratoController();
const faturaController = new FaturaController();
const avisoController = new AvisoController();
const dashboardController = new DashboardController();

router.post('/login', AuthController.login);

router.post('/solicitar-acesso',
    upload.fields([
        { name: 'documentFront', maxCount: 1 },
        { name: 'documentBack', maxCount: 1 }
    ]) as any,
    AuthController.requestAccess
);

router.use(authenticateUser);

// --- USER & PERFIL ---
router.get('/me', userController.getLoggedUserInfo.bind(userController));
router.put('/me/password', userController.updateMyPassword.bind(userController));

// --- ADMINISTRAÇÃO ---
router.post('/users/approve', AuthController.aproveAccess);
router.post('/users/reprove', AuthController.reproveAccess);
router.post('/users/admin', userController.createAdmin.bind(userController));
router.get('/users', userController.getAllUsers.bind(userController));
router.delete('/users/:userId', userController.deleteUser.bind(userController));
router.put('/users/client-password/:clientId', userController.adminResetClientPassword.bind(userController));

// --- CLIENTES ---
router.get('/clients', clienteController.getAllClients.bind(clienteController));
router.get('/clients/:clientId', clienteController.getClientById.bind(clienteController));
router.delete('/clients/:clientId', clienteController.deleteClient.bind(clienteController));
router.put('/clients/:clientId',
    upload.fields([
        { name: 'documentFront', maxCount: 1 },
        { name: 'documentBack', maxCount: 1 }
    ]) as any,
    clienteController.updateClient.bind(clienteController)
);
router.post('/clients',
    upload.fields([
        { name: 'documentFront', maxCount: 1 },
        { name: 'documentBack', maxCount: 1 }
    ]) as any,
    clienteController.createClient.bind(clienteController)
);
router.get('/clients/:clientId/doc-frente', clienteController.getDocumentoFrente.bind(clienteController));
router.get('/clients/:clientId/doc-verso', clienteController.getDocumentoVerso.bind(clienteController));

// --- PRÉDIOS ---
router.post('/predios', predioController.createPredio.bind(predioController));
router.get('/predios', predioController.getPredios.bind(predioController));
router.get('/predios/:predioId', predioController.getPredioById.bind(predioController));
router.put('/predios/:predioId', predioController.updatePredio.bind(predioController));
router.delete('/predios/:predioId', predioController.deletePredio.bind(predioController));

// --- APARTAMENTOS ---
router.post('/apartamentos', apartamentoController.createApartamento.bind(apartamentoController));
router.get('/apartamentos', apartamentoController.getApartamentos.bind(apartamentoController));
router.get('/apartamentos/:apartamentoId', apartamentoController.getApartamentoById.bind(apartamentoController));
router.get('/predios/:predioId/apartamentos', apartamentoController.getApartamentosByPredioId.bind(apartamentoController));
router.put('/apartamentos/:apartamentoId', apartamentoController.updateApartamento.bind(apartamentoController));
router.delete('/apartamentos/:apartamentoId', apartamentoController.deleteApartamento.bind(apartamentoController));

// --- CONTRATOS ---
router.post('/contratos/solicitar', contratoController.solicitarContrato.bind(contratoController));
router.put('/contratos/configurar', contratoController.configurarContrato.bind(contratoController));
router.put('/contratos/:contratoId/reprovar', contratoController.reprovarContrato.bind(contratoController));
router.put('/contratos/cancelar', contratoController.cancelarContrato.bind(contratoController));
router.get('/contratos', contratoController.getContratos.bind(contratoController));
router.get('/me/contratos', contratoController.getMeusContratos.bind(contratoController));
router.get('/contratos/:contratoId', contratoController.getContratoById.bind(contratoController));
router.get('/contratos/:contratoId/pdf', contratoController.downloadContratoPDF.bind(contratoController));

// Assinatura (Upload PDF)
router.post('/contratos/:contratoId/assinar',
    upload.single('file') as any,
    contratoController.assinarContrato.bind(contratoController)
);

// --- FINANCEIRO / FATURAS ---
router.get('/faturas', faturaController.getAllFaturas.bind(faturaController));
router.get('/faturas/:faturaId', faturaController.getFaturaById.bind(faturaController));
router.put('/faturas/:faturaId/valores', faturaController.editarValores.bind(faturaController));
router.get('/faturas/:faturaId/pix', faturaController.getPix.bind(faturaController));
router.put('/faturas/:faturaId/aprovar', faturaController.aprovarPagamento.bind(faturaController));
router.put('/faturas/:faturaId/reprovar', faturaController.reprovarPagamento.bind(faturaController));

// Lançamento de Leitura
router.put('/faturas/:faturaId/leitura',
    upload.single('file') as any,
    faturaController.lancarLeitura.bind(faturaController)
);

// Envio de Comprovante
router.post('/faturas/:faturaId/comprovante',
    upload.single('file') as any,
    faturaController.enviarComprovante.bind(faturaController)
);

// --- AVISOS ---
router.post('/avisos/geral', avisoController.enviarAvisoGeral.bind(avisoController));
router.post('/avisos/individual', avisoController.enviarAvisoIndividual.bind(avisoController));
router.get('/me/avisos', avisoController.getMeusAvisos.bind(avisoController));
router.put('/avisos/:avisoId/lido', avisoController.marcarComoLido.bind(avisoController));
router.delete('/avisos/:avisoId', avisoController.deleteAviso.bind(avisoController));

// --- DASHBOARD ---
router.get('/dashboard/admin', dashboardController.getDashboardAdmin.bind(dashboardController));
router.get('/dashboard/client', dashboardController.getDashboardClient.bind(dashboardController));

export { router };