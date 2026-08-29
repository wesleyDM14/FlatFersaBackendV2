import PDFDocument from 'pdfkit';
import { addMonths, format } from 'date-fns';
import prismaClient from '../prisma';
import { FinalidadeEstabelecimento } from '@prisma/client';
import axios from 'axios';

export async function gerarContratoPDF(contratoId: string, userId: string, dataCallback: any, endCallback: any) {

    try {
        const contrato = await prismaClient.contrato.findUnique({
            where: { id: contratoId }
        });

        if (!contrato) {
            throw new Error('Contrato não encontrado.');
        }

        const userLoggedIn = await prismaClient.user.findUnique({ where: { id: userId } });
        if (!userLoggedIn) throw new Error('Usuário não encontrado.');

        if (userLoggedIn.role !== 'ADMIN') {
            const clienteDoUser = await prismaClient.cliente.findUnique({ where: { userId: userLoggedIn.id } });
            if (!clienteDoUser || contrato.clienteId !== clienteDoUser.id) {
                throw new Error('Sem permissão para baixar este contrato.');
            }
        }

        const cliente = await prismaClient.cliente.findUnique({ where: { id: contrato.clienteId } });
        const apartamento = await prismaClient.apartamento.findUnique({ where: { id: contrato.apartamentoId } });

        if (!apartamento || !cliente) throw new Error('Dados do imóvel ou cliente incompletos.');

        const predio = await prismaClient.predio.findUnique({ where: { id: apartamento.predioId } });
        if (!predio) throw new Error('Prédio não encontrado.');

        let finalidadeTexto = '';
        let atividade = '';

        if (predio.finalidade === FinalidadeEstabelecimento.COMERCIAL) {
            finalidadeTexto = 'Comercial';
            atividade = 'Comércio';
        } else if (predio.finalidade === FinalidadeEstabelecimento.RESIDENCIAL) {
            finalidadeTexto = 'Residencial';
            atividade = 'Residência';
        } else {
            finalidadeTexto = 'Misto';
            atividade = 'Misto';
        }

        const doc = new PDFDocument({ margin: 50 });

        doc.on('data', dataCallback);
        doc.on('end', endCallback);

        // --- CABEÇALHO ---
        doc.font('Times-Bold').fontSize(14).text(`Contrato de Locação ${finalidadeTexto}`, { align: 'center' });
        doc.moveDown();

        doc.font('Times-Italic').fontSize(10).text(`Este contrato visa facilitar a relação entre inquilino e proprietário, seguindo a Lei do Inquilinato (Lei 12.112/09).`, { align: 'justify' });
        doc.moveDown();

        // --- DADOS CADASTRAIS ---
        doc.font('Times-Bold').fontSize(12).text('DADOS DAS PARTES', { align: 'left' });
        doc.moveDown(0.5);

        doc.font('Times-Bold').fontSize(11).text('LOCADOR: ', { continued: true }).font('Times-Roman').text('Anael Antonio Nunes da Costa');
        doc.font('Times-Bold').text('CPF: ', { continued: true }).font('Times-Roman').text('850.941.374-68');

        doc.moveDown(0.5);

        doc.font('Times-Bold').text('LOCATÁRIO: ', { continued: true }).font('Times-Roman').text(cliente.nome);
        doc.font('Times-Bold').text('CPF: ', { continued: true }).font('Times-Roman').text(cliente.cpf);
        if (cliente.rg) doc.font('Times-Bold').text('RG: ', { continued: true }).font('Times-Roman').text(cliente.rg);
        doc.font('Times-Bold').text('TELEFONE: ', { continued: true }).font('Times-Roman').text(cliente.telefone);

        doc.moveDown();

        // --- DADOS DO IMÓVEL ---
        doc.font('Times-Bold').fontSize(12).text('DO IMÓVEL', { align: 'left' });
        doc.moveDown(0.5);

        doc.font('Times-Roman').fontSize(11).text(
            `${finalidadeTexto}, localizado na ${predio.endereco}, ${finalidadeTexto === 'Residencial' ? `Apartamento` : `Sala`} ${apartamento.numero} – Bairro ${predio.bairro}, ${predio.cidade}/${predio.estado}.`,
            { align: 'justify' }
        );
        doc.text(`Finalidade: ${finalidadeTexto} | Atividade: ${atividade}`);

        doc.moveDown();

        // --- DADOS DO CONTRATO (DATAS) ---
        const dataInicio = new Date(contrato.dataInicio);
        const dataFim = contrato.dataFim ? new Date(contrato.dataFim) : addMonths(dataInicio, contrato.duracaoMeses);

        doc.font('Times-Bold').fontSize(12).text('CONDIÇÕES DA LOCAÇÃO', { align: 'left' });
        doc.moveDown(0.5);

        doc.font('Times-Bold').text('Prazo: ', { continued: true }).font('Times-Roman').text(`${contrato.duracaoMeses} meses`);
        doc.font('Times-Bold').text('Início: ', { continued: true }).font('Times-Roman').text(format(dataInicio, 'dd/MM/yyyy'));
        doc.font('Times-Bold').text('Término: ', { continued: true }).font('Times-Roman').text(format(dataFim, 'dd/MM/yyyy'));
        doc.font('Times-Bold').text('Vencimento: ', { continued: true }).font('Times-Roman').text(`Dia ${contrato.diaVencimento} de cada mês`);
        doc.font('Times-Bold').text('Valor Mensal: ', { continued: true }).font('Times-Roman').text(`R$ ${contrato.valorAluguel.toFixed(2)}`);

        doc.moveDown();
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke(); // Linha separadora
        doc.moveDown();

        // --- CLÁUSULAS ---

        const addClausula = (titulo: string, texto: string) => {
            doc.fillColor('red').font('Times-Bold').text(titulo);
            doc.fillColor('black').font('Times-Roman').text(texto, { align: 'justify' });
            doc.moveDown();
        }

        addClausula('CLÁUSULA PRIMEIRA - DO OBJETO',
            `O Locador dá em locação ao Locatário o imóvel descrito acima, para fins exclusivamente de ${atividade}.`
        );

        addClausula('CLÁUSULA SEGUNDA - DO PRAZO',
            `O prazo é de ${contrato.duracaoMeses} meses. Findo o prazo, a renovação ou rescisão obedecerá a Lei do Inquilinato. O locatário obriga-se a restituir o imóvel nas mesmas condições que o recebeu.`
        );

        addClausula('CLÁUSULA TERCEIRA - DO PAGAMENTO',
            `O aluguel de R$ ${contrato.valorAluguel.toFixed(2)} vence no dia ${contrato.diaVencimento}. O pagamento deve ser feito via PIX ou Transferência conforme instruído pelo Locador. Atrasos implicam em multa de 2% + 1% de juros ao mês.`
        );

        addClausula('CLÁUSULA QUARTA - DA CESSÃO',
            `É proibida a sublocação, cessão ou empréstimo do imóvel, total ou parcial, sem consentimento por escrito do Locador.`
        );

        addClausula('CLÁUSULA QUINTA - DOS ENCARGOS',
            `Além do aluguel, o Locatário pagará pelo seu consumo de energia excedente (se houver regra específica no prédio) e eventuais danos causados ao imóvel. A manutenção de lâmpadas e pequenos reparos causados pelo uso é do Locatário.`
        );

        addClausula('CLÁUSULA SEXTA - DA CONSERVAÇÃO',
            `É proibido furar paredes com pregos grandes, pintar paredes com cores escuras ou fazer alterações estruturais sem autorização. O imóvel deve ser mantido limpo e higienizado.`
        );

        addClausula('CLÁUSULA SÉTIMA - DOS ANIMAIS',
            `Fica ESTRITAMENTE PROIBIDA a permanência, criação ou hospedagem de animais de estimação de qualquer espécie ou porte no imóvel locado, sob pena de multa no valor de 1 (um) aluguel vigente e rescisão imediata do contrato por infração contratual.`
        );

        addClausula('CLÁUSULA OITAVA - DA MULTA',
            `A infração de qualquer cláusula sujeita o infrator a uma multa equivalente a 2 (dois) aluguéis, sem prejuízo de rescisão contratual.`
        );

        addClausula('CLÁUSULA NONA - DO FORO',
            `As partes elegem o foro da comarca de ${predio.cidade}/${predio.estado} para dirimir quaisquer dúvidas.`
        );

        if (predio.nome.includes('FlatFersa') || predio.nome.includes('Flat Fersa')) {
            addClausula('CLÁUSULA DÉCIMA - DA ENERGIA (Regra Específica)',
                `O imóvel possui medidor individual. O Locador informará a leitura mensalmente. O Locatário pagará o consumo apurado (Leitura Atual - Anterior) multiplicado pelo valor do kWh vigente, somado ao aluguel. Não há franquia de isenção salvo se acordado em anexo.`
            );
        }

        doc.moveDown(2);

        // --- ASSINATURAS ---

        try {
            const imageUrl = 'https://flatfersa.com.br/wp-content/uploads/2024/10/assinatura.png';
            const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 3000 });
            const imageBuffer = Buffer.from(response.data);
            doc.image(imageBuffer, 70, doc.y, { width: 150 });
            doc.text('____________________________________________________');
            doc.text('LOCADOR (Assinatura Digital)', { indent: 20 });
        } catch (e) {
            doc.text('____________________________________________________');
            doc.text('LOCADOR: Anael Antonio Nunes da Costa', { indent: 20 });
        }

        doc.moveDown(3);

        // --- ASSINATURA DO CLIENTE ---
        doc.text('____________________________________________________');
        doc.font('Times-Bold').text('LOCATÁRIO:', { indent: 20 });
        doc.font('Times-Roman').text(`Nome: ${cliente.nome}`, { indent: 20 });
        doc.text(`CPF: ${cliente.cpf}`, { indent: 20 });
        doc.fillColor('red').fontSize(10).text('(Obrigatório Assinar)', { indent: 20 });

        doc.moveDown(2);

        const dateText = `${predio.cidade}/${predio.estado}, ${format(new Date(), 'dd/MM/yyyy')}`;
        doc.fillColor('black').fontSize(12).text(dateText, { align: 'center' });

        doc.end();

    } catch (error: any) {
        console.error('Erro ao gerar PDF do contrato: ' + error.message);
        throw new Error('Erro ao gerar PDF: ' + error.message);
    }
}