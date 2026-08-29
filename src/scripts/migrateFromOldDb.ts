import mysql from 'mysql2/promise';
import { addMonths, subMonths } from 'date-fns';
import { Role, StatusCadastro, FinalidadeEstabelecimento, StatusApartamento, StatusContrato, StatusPagamento, TipoAviso } from '@prisma/client';
import prismaClient from '../prisma';

const OLD_DATABASE_URL = process.env.OLD_DATABASE_URL;

if (!OLD_DATABASE_URL) {
    throw new Error('OLD_DATABASE_URL não definida. Passe a connection string do banco antigo (flatfersa_app) via variável de ambiente.');
}

function toStatusCadastro(statusClient: string): StatusCadastro {
    if (statusClient === 'ATIVO') return StatusCadastro.APROVADO;
    if (statusClient === 'REPROVADO') return StatusCadastro.REPROVADO;
    return StatusCadastro.PENDENTE_APROVACAO;
}

async function main() {
    const oldConn = await mysql.createConnection(OLD_DATABASE_URL as string);
    console.log('Conectado ao banco antigo.');

    try {
        // ---------- USERS ----------
        const [oldUsers] = await oldConn.query('SELECT * FROM User');
        const users = oldUsers as any[];
        const clientIdToUserId = new Map<string, string>();

        for (const u of users) {
            if (u.clientId) clientIdToUserId.set(u.clientId, u.id);

            await prismaClient.user.upsert({
                where: { id: u.id },
                create: {
                    id: u.id,
                    email: u.email,
                    password: u.password,
                    role: u.isAdmin ? Role.ADMIN : Role.INQUILINO,
                    createdAt: u.createdAt,
                    updatedAt: u.updatedAt,
                },
                update: {
                    email: u.email,
                    password: u.password,
                    role: u.isAdmin ? Role.ADMIN : Role.INQUILINO,
                },
            });
        }
        console.log(`Users sincronizados: ${users.length}`);

        // ---------- CLIENTES ----------
        const [oldClientes] = await oldConn.query('SELECT * FROM Cliente');
        const clientes = oldClientes as any[];

        for (const c of clientes) {
            const userId = clientIdToUserId.get(c.id);
            if (!userId) {
                console.warn(`Cliente ${c.id} (cpf ${c.cpf}) sem User correspondente no banco antigo — pulado.`);
                continue;
            }

            await prismaClient.cliente.upsert({
                where: { id: c.id },
                create: {
                    id: c.id,
                    nome: c.name,
                    cpf: c.cpf,
                    rg: c.rg,
                    dataNascimento: c.dateBirth,
                    telefone: c.phone,
                    enderecoAtual: c.address,
                    docFrenteUrl: c.documentoFrente,
                    docVersoUrl: c.documentoVerso,
                    statusCadastro: toStatusCadastro(c.statusClient),
                    userId,
                    createdAt: c.createdAt,
                    updatedAt: c.updatedAt,
                },
                update: {
                    nome: c.name,
                    cpf: c.cpf,
                    rg: c.rg,
                    dataNascimento: c.dateBirth,
                    telefone: c.phone,
                    enderecoAtual: c.address,
                    docFrenteUrl: c.documentoFrente,
                    docVersoUrl: c.documentoVerso,
                    statusCadastro: toStatusCadastro(c.statusClient),
                },
            });
        }
        console.log(`Clientes sincronizados: ${clientes.length}`);

        // ---------- PRÉDIOS ----------
        const [oldPredios] = await oldConn.query('SELECT * FROM Predio');
        const predios = oldPredios as any[];
        const predioKwhPrice = new Map<string, number>();

        for (const p of predios) {
            predioKwhPrice.set(p.id, p.kwhPrice);

            await prismaClient.predio.upsert({
                where: { id: p.id },
                create: {
                    id: p.id,
                    nome: p.nome,
                    endereco: p.endereco,
                    bairro: p.bairro,
                    cidade: p.cidade,
                    estado: p.estado,
                    precoKwhAtual: p.kwhPrice,
                    finalidade: p.finalidade as FinalidadeEstabelecimento,
                    diaVencimentoPadrao: 5,
                    createdAt: p.createdAt,
                    updatedAt: p.updatedAt,
                },
                update: {
                    nome: p.nome,
                    endereco: p.endereco,
                    bairro: p.bairro,
                    cidade: p.cidade,
                    estado: p.estado,
                    precoKwhAtual: p.kwhPrice,
                    finalidade: p.finalidade as FinalidadeEstabelecimento,
                },
            });
        }
        console.log(`Prédios sincronizados: ${predios.length}`);

        // ---------- APARTAMENTOS ----------
        const [oldApartamentos] = await oldConn.query('SELECT * FROM Apartamento');
        const apartamentos = oldApartamentos as any[];
        const apartamentoPredioId = new Map<string, string>();

        for (const a of apartamentos) {
            apartamentoPredioId.set(a.id, a.id_predio);

            await prismaClient.apartamento.upsert({
                where: { id: a.id },
                create: {
                    id: a.id,
                    numero: String(a.numero),
                    valorBase: a.valorBase,
                    climatizado: !!a.climatizado,
                    status: a.status as StatusApartamento,
                    predioId: a.id_predio,
                    createdAt: a.createdAt,
                    updatedAt: a.updatedAt,
                },
                update: {
                    numero: String(a.numero),
                    valorBase: a.valorBase,
                    climatizado: !!a.climatizado,
                    status: a.status as StatusApartamento,
                    predioId: a.id_predio,
                },
            });
        }
        console.log(`Apartamentos sincronizados: ${apartamentos.length}`);

        // ---------- CONTRATOS ----------
        const [oldContratos] = await oldConn.query('SELECT * FROM Contrato');
        const contratos = oldContratos as any[];
        const contratoKwhPrice = new Map<string, number>();

        for (const c of contratos) {
            const dataInicio = new Date(c.dataInicio);
            const dataFim = addMonths(dataInicio, c.duracaoContrato);
            const predioId = apartamentoPredioId.get(c.aptId);
            contratoKwhPrice.set(c.id, predioId ? (predioKwhPrice.get(predioId) || 0) : 0);

            await prismaClient.contrato.upsert({
                where: { id: c.id },
                create: {
                    id: c.id,
                    status: c.statusContrato as StatusContrato,
                    dataInicio,
                    dataFim,
                    duracaoMeses: c.duracaoContrato,
                    diaVencimento: c.diaVencimentoPagamento,
                    valorAluguel: c.valorAluguel,
                    leituraInicial: c.leituraInicial,
                    limiteKwhIsento: c.limiteKwh || 0,
                    linkPdfContrato: c.linkPdfAssinado,
                    assinado: !!c.assinado,
                    apartamentoId: c.aptId,
                    clienteId: c.clientId,
                    createdAt: c.createdAt,
                    updatedAt: c.updatedAt,
                },
                update: {
                    status: c.statusContrato as StatusContrato,
                    dataInicio,
                    dataFim,
                    duracaoMeses: c.duracaoContrato,
                    diaVencimento: c.diaVencimentoPagamento,
                    valorAluguel: c.valorAluguel,
                    leituraInicial: c.leituraInicial,
                    limiteKwhIsento: c.limiteKwh || 0,
                    linkPdfContrato: c.linkPdfAssinado,
                    assinado: !!c.assinado,
                    apartamentoId: c.aptId,
                    clienteId: c.clientId,
                },
            });
        }
        console.log(`Contratos sincronizados: ${contratos.length}`);

        // ---------- FATURAS (a partir de PrestacaoAluguel) ----------
        const [oldPrestacoes] = await oldConn.query('SELECT * FROM PrestacaoAluguel');
        const prestacoes = oldPrestacoes as any[];

        for (const f of prestacoes) {
            const dataVencimento = new Date(f.dataVencimento);
            const mesReferencia = subMonths(dataVencimento, 1);
            const consumoKWh = f.consumoKWh || 0;
            const valorEnergia = f.valorExcedenteKWh || 0;
            const valorMulta = f.multa || 0;
            const valorAluguel = f.valor;
            const valorTotal = valorAluguel + valorEnergia + valorMulta;
            const precoKwhAplicado = consumoKWh > 0 ? valorEnergia / consumoKWh : (contratoKwhPrice.get(f.contractId) || 0);
            const observacao = f.tipo === 'CALCAO' ? 'Calção (dado migrado do sistema anterior)' : null;
            const tentativasCobranca = (f.tentativasAdmin || 0) + (f.tentativasClient || 0);
            const datasNotificacao = [f.notificadoAdminEm, f.notificadoClientEm].filter(Boolean) as Date[];
            const ultimaNotificacao = datasNotificacao.length > 0
                ? new Date(Math.max(...datasNotificacao.map(d => new Date(d).getTime())))
                : null;

            await prismaClient.fatura.upsert({
                where: { id: f.id },
                create: {
                    id: f.id,
                    mesReferencia,
                    dataVencimento,
                    valorAluguel,
                    valorMulta,
                    leituraAnterior: 0,
                    leituraAtual: consumoKWh,
                    fotoLeituraUrl: null,
                    consumoTotal: consumoKWh,
                    consumoCobrado: consumoKWh,
                    precoKwhAplicado,
                    valorEnergia,
                    descontoAplicado: 0,
                    acrescimoAplicado: 0,
                    observacao,
                    valorTotal,
                    status: f.statusPagamento as StatusPagamento,
                    dataPagamento: f.dataPagamento,
                    metodoPagamento: null,
                    comprovanteUrl: f.linkComprovante,
                    tentativasCobranca,
                    ultimaNotificacao,
                    contratoId: f.contractId,
                    createdAt: f.createdAt,
                    updatedAt: f.updatedAt,
                },
                update: {
                    mesReferencia,
                    dataVencimento,
                    valorAluguel,
                    valorMulta,
                    leituraAtual: consumoKWh,
                    consumoTotal: consumoKWh,
                    consumoCobrado: consumoKWh,
                    precoKwhAplicado,
                    valorEnergia,
                    observacao,
                    valorTotal,
                    status: f.statusPagamento as StatusPagamento,
                    dataPagamento: f.dataPagamento,
                    comprovanteUrl: f.linkComprovante,
                    tentativasCobranca,
                    ultimaNotificacao,
                    contratoId: f.contractId,
                },
            });
        }
        console.log(`Faturas sincronizadas: ${prestacoes.length}`);

        // ---------- AVISOS ----------
        const [oldAvisos] = await oldConn.query('SELECT * FROM Avisos');
        const avisos = oldAvisos as any[];

        for (const av of avisos) {
            await prismaClient.avisos.upsert({
                where: { id: av.id },
                create: {
                    id: av.id,
                    lido: !!av.readed,
                    titulo: av.title,
                    conteudo: av.content,
                    tipo: TipoAviso.GERAL,
                    userId: av.userId,
                    createdAt: av.createdAt,
                },
                update: {
                    lido: !!av.readed,
                    titulo: av.title,
                    conteudo: av.content,
                    userId: av.userId,
                },
            });
        }
        console.log(`Avisos sincronizados: ${avisos.length}`);

        // ---------- RESUMO ----------
        const counts = {
            users: await prismaClient.user.count(),
            clientes: await prismaClient.cliente.count(),
            predios: await prismaClient.predio.count(),
            apartamentos: await prismaClient.apartamento.count(),
            contratos: await prismaClient.contrato.count(),
            faturas: await prismaClient.fatura.count(),
            avisos: await prismaClient.avisos.count(),
        };
        console.log('--- Contagem final no banco novo ---');
        console.log(counts);

    } finally {
        await oldConn.end();
        await prismaClient.$disconnect();
    }
}

main()
    .then(() => {
        console.log('Migração concluída com sucesso.');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Erro na migração:', error);
        process.exit(1);
    });
