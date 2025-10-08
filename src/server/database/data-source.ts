import { DataSource } from "typeorm"
import path = require("path");
import * as dotenv from 'dotenv';

dotenv.config();

const portDB = process.env.DB_PORT as unknown as number;

const diretorioDataBase = path.resolve(__dirname, '..');

const isProduction = process.env.NODE_ENV === 'production';

const optionsSSL = {
    ssl: {
        require: true,
        rejectUnauthorized: false,
    }
}

export const AppDataSource = new DataSource({
    type: "mysql",
    host: process.env.HOST,
    port: portDB,
    username: process.env.DB_USER,
    password: process.env.PASSWORD,
    database: process.env.DB_NAME,
    entities: [`${diretorioDataBase}/**/entities/*.{ts,js}`],
    migrations: [`${diretorioDataBase}/**/migrations/*.{ts,js}`],
    extra: isProduction ? optionsSSL : undefined,
    synchronize: false,
    logging: ['error'],
    maxQueryExecutionTime: 30000,
    cache: {
        duration: 30000
    }
})