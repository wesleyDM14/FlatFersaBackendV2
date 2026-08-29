import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import prismaClient from "../prisma";

const expo = new Expo();

type AvisoPushPayload = {
    userId: string;
    titulo: string;
    conteudo: string;
};

// Dispara notificações push (Expo) para uma lista de avisos recém-criados.
// Nunca lança erro — falha de push não pode derrubar a criação do aviso em si
// (o aviso já foi salvo no banco; o push é só um "a mais").
export async function sendAvisoPushNotifications(avisos: AvisoPushPayload[]) {
    try {
        if (!avisos || avisos.length === 0) return;

        const userIds = [...new Set(avisos.map(a => a.userId))];
        const users = await prismaClient.user.findMany({
            where: { id: { in: userIds }, pushToken: { not: null } },
            select: { id: true, pushToken: true }
        });

        const tokenByUserId = new Map(users.map(u => [u.id, u.pushToken as string]));

        const messages: ExpoPushMessage[] = [];
        for (const aviso of avisos) {
            const token = tokenByUserId.get(aviso.userId);
            if (!token || !Expo.isExpoPushToken(token)) continue;

            messages.push({
                to: token,
                sound: 'default',
                title: aviso.titulo,
                body: aviso.conteudo,
                data: { tipo: 'aviso' },
            });
        }

        if (messages.length === 0) return;

        const chunks = expo.chunkPushNotifications(messages);
        for (const chunk of chunks) {
            try {
                await expo.sendPushNotificationsAsync(chunk);
            } catch (err) {
                console.error('Erro ao enviar chunk de push notifications:', err);
            }
        }
    } catch (error: any) {
        console.error('Erro ao enviar push notifications:', error.message);
    }
}
