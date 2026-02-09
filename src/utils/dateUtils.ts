import { format, toZonedTime } from 'date-fns-tz';
import { addMonths, isAfter, startOfDay, endOfDay } from 'date-fns';

const TIMEZONE = 'America/Sao_Paulo';

export function getDataAtualBrasil(): Date {
    const agora = new Date();
    return toZonedTime(agora, TIMEZONE);
}

export function verificarAtraso(dataVencimento: Date): boolean {
    const agoraBrasil = getDataAtualBrasil();

    const vencimentoFimDoDia = toZonedTime(endOfDay(dataVencimento), TIMEZONE);

    return isAfter(agoraBrasil, vencimentoFimDoDia);
}

export function formatarDataBr(data: Date): string {
    return format(toZonedTime(data, TIMEZONE), 'dd/MM/yyyy HH:mm', { timeZone: TIMEZONE });
}

export function adicionarMeses(data: Date, meses: number): Date {
    return addMonths(data, meses);
}