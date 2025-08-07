import { MigrationInterface, QueryRunner } from "typeorm";

export class Default1754590885835 implements MigrationInterface {
    name = 'Default1754590885835'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`icecs\` (\`id\` varchar(36) NOT NULL, \`ICEC\` float NOT NULL, \`ATÉ_50\` float NOT NULL, \`MAIS_DE_50\` float NOT NULL, \`SEMIDURAVEIS\` float NOT NULL, \`NAO_DURAVEIS\` float NOT NULL, \`DURAVEIS\` float NOT NULL, \`MES\` int NOT NULL, \`ANO\` int NOT NULL, \`REGIAO\` enum ('BR', 'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO') NOT NULL, \`METODO\` enum ('Planilha', 'Web Scraping') NOT NULL, \`DATA_INSERCAO\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`peics\` (\`id\` varchar(36) NOT NULL, \`ENDIVIDADOS_PERCENTUAL\` float NOT NULL, \`CONTAS_EM_ATRASO_PERCENTUAL\` float NOT NULL, \`NÃO_TERAO_CONDICOES_DE_PAGAR_PERCENTUAL\` float NOT NULL, \`ENDIVIDADOS_ABSOLUTO\` text NOT NULL, \`CONTAS_EM_ATRASO_ABSOLUTO\` text NOT NULL, \`NAO_TERÃO_CONDICOES_DE_PAGAR_ABSOLUTO\` text NOT NULL, \`MES\` int NOT NULL, \`ANO\` int NOT NULL, \`REGIAO\` enum ('BR', 'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO') NOT NULL, \`METODO\` enum ('Planilha', 'Web Scraping') NOT NULL, \`DATA_INSERCAO\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`icfs\` (\`id\` varchar(36) NOT NULL, \`NC_PONTOS\` float NOT NULL, \`ATE_10_SM_PONTOS\` float NOT NULL, \`MAIS_DE_10_SM_PONTOS\` float NOT NULL, \`NC_PERCENTUAL\` float NOT NULL, \`ATE_10_SM_PERCENTUAL\` float NOT NULL, \`MAIS_DE_10_SM_PERCENTUAL\` float NOT NULL, \`MES\` int NOT NULL, \`ANO\` int NOT NULL, \`REGIAO\` enum ('BR', 'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO') NOT NULL, \`METODO\` enum ('Planilha', 'Web Scraping') NOT NULL, \`DATA_INSERCAO\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE \`icfs\``);
        await queryRunner.query(`DROP TABLE \`peics\``);
        await queryRunner.query(`DROP TABLE \`icecs\``);
    }

}
