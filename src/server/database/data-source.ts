import { DataSource } from "typeorm"
import path = require("path");
import * as dotenv from 'dotenv';

dotenv.config();

const portDB = process.env.DB_PORT as unknown as number;

const diretorioDataBase = path.resolve(__dirname, '..');

export const AppDataSource = new DataSource({
    type: "mysql",
    host: process.env.HOST,
    port: portDB,
    username: process.env.DB_USER,
    password: process.env.PASSWORD,
    database: process.env.DB_NAME,
    entities: [`${diretorioDataBase}/**/entities/*.{ts,js}`],
    migrations: [`${diretorioDataBase}/**/migrations/*.{ts,js}`]
})
