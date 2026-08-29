import { PrismaClient } from '@prisma/client';
import { sendAvisoPushNotifications } from '../services/pushNotificationService';

const basePrismaClient = new PrismaClient();

// Extensão que dispara push notification (Expo) toda vez que um Aviso é criado,
// não importa qual service fez a chamada — evita ter que espalhar a lógica de
// push em cada um dos vários lugares que criam Avisos (contratoService, faturaService,
// authService, cronService, avisoServices).
const prismaClient = basePrismaClient.$extends({
    query: {
        avisos: {
            async create({ args, query }) {
                const result = await query(args);
                sendAvisoPushNotifications([{
                    userId: args.data.userId,
                    titulo: args.data.titulo,
                    conteudo: args.data.conteudo,
                }]);
                return result;
            },
            async createMany({ args, query }) {
                const result = await query(args);
                const dataArray = Array.isArray(args.data) ? args.data : [args.data];
                sendAvisoPushNotifications(dataArray.map(d => ({
                    userId: d.userId,
                    titulo: d.titulo,
                    conteudo: d.conteudo,
                })));
                return result;
            },
        },
    },
});

export default prismaClient;
