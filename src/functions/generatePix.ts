import { QrCodePix, QrCodePixParams } from "qrcode-pix";

function limparChavePix(chave: string): string {
    if (chave.includes('@')) return chave;
    return chave.replace(/[^\d+]/g, '');
}

export async function generateQrCodePix(data: QrCodePixParams) {
    try {
        const qrCodePix = QrCodePix({
            version: data.version || '01',
            key: limparChavePix(data.key),
            name: data.name.trim(),
            city: data.city.trim(),
            transactionId: data.transactionId || '***',
            message: data.message,
            value: data.value,
            cep: data.cep,
            currency: data.currency || 986,
            countryCode: data.countryCode || 'BR',
        });

        const payload = qrCodePix.payload();
        const image = await qrCodePix.base64();

        return { payload: payload, base64: image };
    } catch (error: any) {
        console.error('Erro ao gerar codigo PIX: ' + error.message);
        throw new Error('Falha na geração do QR Code PIX.');
    }
}