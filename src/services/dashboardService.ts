import prismaClient from "../prisma";
import { StatusPagamento, StatusContrato, StatusApartamento, StatusCadastro } from "@prisma/client";
import { startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import { verificarAtraso } from "../utils/dateUtils";

class DashboardService {

    async getDashboardAdmin() {
        const hoje = new Date();
        const inicioMes = startOfMonth(hoje);
        const fimMes = endOfMonth(hoje);

        // 1. RECEBIDO NO MÊS (Caixa Real)
        // Soma tudo que foi PAGO onde a data do pagamento é dentro deste mês
        const recebidoMesAgregado = await prismaClient.fatura.aggregate({
            _sum: { valorTotal: true },
            where: {
                status: StatusPagamento.PAGO,
                dataPagamento: {
                    gte: inicioMes,
                    lte: fimMes
                }
            }
        });

        // 2. PREVISÃO TOTAL DO MÊS (Potencial)
        // Soma tudo que VENCE neste mês (independente se pagou ou não), exceto cancelados
        const previstoMesAgregado = await prismaClient.fatura.aggregate({
            _sum: { valorTotal: true },
            where: {
                dataVencimento: {
                    gte: inicioMes,
                    lte: fimMes
                },
                status: { not: StatusPagamento.CANCELADO }
            }
        });

        // 3. INADIMPLÊNCIA GERAL (Acumulado)
        // Soma tudo que está ATRASADO, ou PENDENTE mas já passou do fim do dia de vencimento
        const faturasPendentesOuAtrasadas = await prismaClient.fatura.findMany({
            where: {
                OR: [
                    { status: StatusPagamento.ATRASADO },
                    { status: StatusPagamento.PENDENTE }
                ]
            },
            select: { status: true, dataVencimento: true, valorTotal: true }
        });

        const totalAtrasado = faturasPendentesOuAtrasadas
            .filter(f => f.status === StatusPagamento.ATRASADO || verificarAtraso(f.dataVencimento))
            .reduce((acc, f) => acc + f.valorTotal, 0);

        // Valores limpos
        const totalRecebidoMes = recebidoMesAgregado._sum.valorTotal || 0;
        const totalPrevistoMes = previstoMesAgregado._sum.valorTotal || 0;

        // 4. DADOS AUXILIARES (Ocupação e Clientes)
        const totalApartamentos = await prismaClient.apartamento.count();
        const apartamentosOcupados = await prismaClient.apartamento.count({ where: { status: StatusApartamento.OCUPADO } });
        const porcentagemOcupacao = totalApartamentos > 0 ? ((apartamentosOcupados / totalApartamentos) * 100).toFixed(1) : 0;
        const clientesPendentes = await prismaClient.cliente.count({ where: { statusCadastro: StatusCadastro.PENDENTE_APROVACAO } });
        const contratosAtivos = await prismaClient.contrato.count({ where: { status: StatusContrato.ATIVO } });

        // 5. GRÁFICO DE FATURAMENTO ANUAL (Jan a Dez)
        const anoAtual = hoje.getFullYear();
        const pagamentosAno = await prismaClient.fatura.findMany({
            where: {
                status: StatusPagamento.PAGO,
                dataPagamento: {
                    gte: startOfYear(hoje),
                    lte: endOfYear(hoje)
                }
            },
            select: { dataPagamento: true, valorTotal: true }
        });

        const faturamentoPorMes = Array(12).fill(0);
        pagamentosAno.forEach(f => {
            if (f.dataPagamento) {
                const mes = f.dataPagamento.getMonth();
                faturamentoPorMes[mes] += f.valorTotal;
            }
        });

        const monthlyRevenueData = {
            labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
            data: faturamentoPorMes
        };

        // 6. ALERTA DE CONTRATOS VENCENDO (Próximos 30 dias)
        // Busca contratos ativos e calcula se vence logo
        const trintaDias = new Date();
        trintaDias.setDate(trintaDias.getDate() + 30);

        // Faturas em aberto (pendentes que vencem nos próximos 30 dias) ou já atrasadas
        const faturasEmAberto = await prismaClient.fatura.findMany({
            where: {
                OR: [
                    { status: StatusPagamento.ATRASADO },
                    { status: StatusPagamento.PENDENTE, dataVencimento: { lte: trintaDias } }
                ]
            },
            orderBy: { dataVencimento: 'asc' },
            take: 15,
            include: {
                contrato: {
                    include: {
                        cliente: { select: { nome: true } },
                        apartamento: { select: { numero: true } }
                    }
                }
            }
        });

        const faturasVencendo = faturasEmAberto.map(f => ({
            id: f.id,
            cliente: f.contrato.cliente.nome,
            apartamento: f.contrato.apartamento.numero,
            vencimento: f.dataVencimento,
            valor: f.valorTotal,
            status: f.status === StatusPagamento.PENDENTE && verificarAtraso(f.dataVencimento)
                ? StatusPagamento.ATRASADO
                : f.status
        }));


        // RETORNO FINAL
        return {
            cards: {
                recebidoMes: totalRecebidoMes,
                previstoMes: totalPrevistoMes,
                atrasadoGeral: totalAtrasado,
                taxaOcupacao: Number(porcentagemOcupacao),
                clientesPendentes,
                contratosAtivos
            },
            charts: {
                monthlyRevenue: monthlyRevenueData,
                // Gráfico Pizza: Do previsto do mês, quanto já recebi e quanto falta
                statusFinanceiroMes: {
                    labels: ['Recebido', 'A Receber'],
                    data: [totalRecebidoMes, Math.max(0, totalPrevistoMes - totalRecebidoMes)]
                }
            },
            alerts: {
                faturasVencendo
            }
        };
    }

    async getDashboardClient(userId: string) {
        const cliente = await prismaClient.cliente.findUnique({ where: { userId } });
        if (!cliente) throw new Error("Perfil não encontrado.");

        const faturas = await prismaClient.fatura.findMany({
            where: { contrato: { clienteId: cliente.id } },
            orderBy: { dataVencimento: 'desc' },
            take: 12
        });

        const pendentes = faturas.filter(f => f.status === StatusPagamento.PENDENTE || f.status === StatusPagamento.ATRASADO);
        const ultimaFatura = faturas[0];
        const penultimaFatura = faturas[1];

        let statusEnergia = "Estável";
        let diferencaKwh = 0;

        if (ultimaFatura && penultimaFatura) {
            diferencaKwh = (ultimaFatura.consumoTotal || 0) - (penultimaFatura.consumoTotal || 0);
            if (diferencaKwh > 5) statusEnergia = "Aumentou";
            else if (diferencaKwh < -5) statusEnergia = "Diminuiu";
        }

        return {
            summary: {
                faturasEmAberto: pendentes.length,
                valorPendente: pendentes.reduce((acc, curr) => acc + curr.valorTotal, 0),
            },
            energyInsights: {
                ultimaLeitura: ultimaFatura?.leituraAtual || 0,
                consumoUltimoMes: ultimaFatura?.consumoTotal || 0,
                status: statusEnergia,
                diferenca: diferencaKwh
            },
            nextPayments: pendentes.slice(0, 3).map(f => ({
                id: f.id,
                vencimento: f.dataVencimento,
                valor: f.valorTotal,
                status: f.status
            }))
        };
    }
}

export default DashboardService;