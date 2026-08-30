import axios from "axios";
import fs from 'fs';
import getToken from "./getToken";

// Mesmo fluxo de upload já usado em faturaService/clienteService (mídia hospedada
// no WordPress do cliente via REST API) - extraído aqui para reuso em novas features
// sem duplicar a lógica de novo.
export async function uploadToWordPress(file: Express.Multer.File): Promise<string | null> {
    try {
        const token = await getToken();
        const res = await axios.post(
            `${process.env.WORDPRESS_URL}/wp-json/wp/v2/media`,
            fs.createReadStream(file.path),
            {
                headers: {
                    'Content-Disposition': `attachment; filename="${file.originalname}"`,
                    'Content-Type': file.mimetype,
                    'Authorization': `Bearer ${token}`
                }
            }
        );
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        return res.data.source_url;
    } catch (err: any) {
        console.error("Erro upload de imagem:", err.message);
        return null;
    }
}
