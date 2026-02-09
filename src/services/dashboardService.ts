import prismaClient from "../prisma";
import dayjs from "dayjs";
import { StatusPagamento, StatusContrato, StatusApartamento, StatusCadastro } from "@prisma/client";
import { addMonths, isBefore, addDays, startOfMonth, endOfMonth } from "date-fns";

class DashboardService {

    async getDashboardAdmin() {
        const hoje = new Date();
        const inicioMes = startOfMonth(hoje);
        const fimMes = endOfMonth(hoje);

        const ganhos = await prismaClient.fatura.aggregate({
            _sum: { valorTotal: true, valorEnergia: true, valorAluguel: true, valorMulta: true },
            where: { status: StatusPagamento.PAGO }
        });

        const previsaoMes = await prismaClient.fatura.aggregate({
            _sum: { valorTotal: true },
            where: {
                dataVencimento: { gte: inicioMes, lte: fimMes },
                status: { not: StatusPagamento.CANCELADO }
            }
        });

        const inadimplencia = await prismaClient.fatura.aggregate({
            _sum: { valorTotal: true },
            where: {
                status: { in: [StatusPagamento.PENDENTE, StatusPagamento.ATRASADO] },
                dataVencimento: { lt: hoje }
            }
        });

        const totalGanho = ganhos._sum.valorTotal || 0;
        const totalAtrasado = inadimplencia._sum.valorTotal || 0;
        const receitaPrevista = previsaoMes._sum.valorTotal || 0;

        const todosContratos = await prismaClient.contrato.findMany({
            where: { status: StatusContrato.ATIVO },
            include: { cliente: { select: { nome: true } }, apartamento: { select: { numero: true } } }
        });

        const contratosVencendo = todosContratos.filter(c => {
            const dataFimCalculada = addMonths(new Date(c.dataInicio), c.duracaoMeses);
            const daqui30Dias = addDays(hoje, 30);
            return isBefore(dataFimCalculada, daqui30Dias) && isBefore(hoje, dataFimCalculada);
        }).map(c => ({
            id: c.id,
            cliente: c.cliente.nome,
            apartamento: c.apartamento.numero,
            vencimento: addMonths(new Date(c.dataInicio), c.duracaoMeses)
        }));

        const apartamentosOcupados = await prismaClient.apartamento.count({ where: { status: StatusApartamento.OCUPADO } });
        const totalApartamentos = await prismaClient.apartamento.count();
        const clientesPendentes = await prismaClient.cliente.count({ where: { statusCadastro: StatusCadastro.PENDENTE_APROVACAO } });

        const anoAtual = dayjs().year();
        const pagamentosAno = await prismaClient.fatura.findMany({
            where: {
                dataPagamento: { gte: new Date(`${anoAtual}-01-01`), lt: new Date(`${anoAtual + 1}-01-01`) },
                status: StatusPagamento.PAGO,
            },
            select: { dataPagamento: true, valorTotal: true },
        });

        const faturamentoPorMes = Array(12).fill(0);
        pagamentosAno.forEach(({ dataPagamento, valorTotal }) => {
            if (dataPagamento) faturamentoPorMes[dataPagamento.getMonth()] += valorTotal;
        });

        return {
            cards: {
                totalGanho,
                receitaPrevista,
                totalAtrasado,
                taxaOcupacao: totalApartamentos > 0 ? ((apartamentosOcupados / totalApartamentos) * 100).toFixed(1) : 0,
                clientesPendentes
            },
            alerts: {
                contratosVencendo
            },
            charts: {
                monthlyRevenue: {
                    labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
                    data: faturamentoPorMes
                },
                financialStatus: {
                    labels: ["Pago", "Aberto", "Atrasado"],
                    data: [totalGanho, (receitaPrevista - totalGanho), totalAtrasado]
                }
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