import express, { Request, Response, NextFunction } from "express";
import 'express-async-errors';
import cors from 'cors';
import fs from 'fs';
import 'dotenv/config';

import { router } from "./routes";
import CronService from "./services/cronService";

const app = express();
const PORT = process.env.PORT || 3333;

const tmpDir = './tmp';
if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir);
    console.log('📁 Pasta temporária (tmp) criada.');
}

app.use(express.json());
app.use(cors());

app.use(router);

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof Error) {
        return res.status(400).json({
            status: 'error',
            message: err.message
        });
    }

    console.error(err);
    return res.status(500).json({
        status: 'error',
        message: 'Internal Server Error'
    });
});

new CronService();

const server = app.listen(PORT, () => {
    console.log(`🚀 Servidor V2 rodando na porta ${PORT}`);
});

process.on('SIGINT', () => {
    server.close();
    console.log('Servidor encerrado.');
});