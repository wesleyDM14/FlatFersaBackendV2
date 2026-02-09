import { createTransport, Transporter } from "nodemailer";

interface EmailOptions {
    to: string;
    subject: string;
    html: string;
}

export class EmailService {
    private transporter: Transporter;

    constructor() {
        this.transporter = createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT),
            secure: true,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });
    }

    async sendEmail(options: EmailOptions): Promise<void> {
        try {
            await this.transporter.sendMail({
                from: `Flatfersa <${process.env.EMAIL_USER}>`,
                to: options.to,
                subject: options.subject,
                html: options.html
            });
        } catch (error) {
            console.error('Erro ao enviar e-mail:', error);
            throw new Error('Falha ao enviar e-mail');
        }
    }
}