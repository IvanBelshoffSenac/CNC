import { MigrationInterface, QueryRunner } from "typeorm";

export class Default1756745112368 implements MigrationInterface {
    name = 'Default1756745112368'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`metadados_peic\` (\`id\` varchar(36) NOT NULL, \`TIPOINDICE\` text NOT NULL, \`CAMPO\` text NOT NULL, \`TOTAL\` text NOT NULL, \`ATE_10_SM\` text NOT NULL, \`MAIS_DE_10_SM\` text NOT NULL, \`NUMERO_ABSOLUTO\` text NOT NULL, \`DATA_INSERCAO\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`peic_id\` varchar(36) NOT NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`peics\` (\`id\` varchar(36) NOT NULL, \`ENDIVIDADOS_PERCENTUAL\` text NOT NULL, \`CONTAS_EM_ATRASO_PERCENTUAL\` text NOT NULL, \`NÃO_TERAO_CONDICOES_DE_PAGAR_PERCENTUAL\` text NOT NULL, \`ENDIVIDADOS_ABSOLUTO\` text NOT NULL, \`CONTAS_EM_ATRASO_ABSOLUTO\` text NOT NULL, \`NAO_TERÃO_CONDICOES_DE_PAGAR_ABSOLUTO\` text NOT NULL, \`MES\` int NOT NULL, \`ANO\` int NOT NULL, \`REGIAO\` enum ('BR', 'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO') NOT NULL, \`METODO\` enum ('Planilha', 'Web Scraping') NOT NULL, \`DATA_INSERCAO\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`icecs\` (\`id\` varchar(36) NOT NULL, \`ICEC\` text NOT NULL, \`ATÉ_50\` text NOT NULL, \`MAIS_DE_50\` text NOT NULL, \`SEMIDURAVEIS\` text NOT NULL, \`NAO_DURAVEIS\` text NOT NULL, \`DURAVEIS\` text NOT NULL, \`MES\` int NOT NULL, \`ANO\` int NOT NULL, \`REGIAO\` enum ('BR', 'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO') NOT NULL, \`METODO\` enum ('Planilha', 'Web Scraping') NOT NULL, \`DATA_INSERCAO\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`metadados_icec\` (\`id\` varchar(36) NOT NULL, \`TIPOINDICE\` text NOT NULL, \`CAMPO\` text NOT NULL, \`TOTAL\` text NOT NULL, \`EMPRESAS_COM_ATÉ_50_EMPREGADOS\` text NOT NULL, \`EMPRESAS_COM_MAIS_DE_50_EMPREGADOS\` text NOT NULL, \`SEMIDURAVEIS\` text NOT NULL, \`NAO_DURAVEIS\` text NOT NULL, \`DURAVEIS\` text NOT NULL, \`TIPOPESQUISA\` text NOT NULL, \`INDICE\` tinyint NOT NULL, \`DATA_INSERCAO\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`icec_id\` varchar(36) NOT NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`icfs\` (\`id\` varchar(36) NOT NULL, \`NC_PONTOS\` text NOT NULL, \`ATE_10_SM_PONTOS\` text NOT NULL, \`MAIS_DE_10_SM_PONTOS\` text NOT NULL, \`NC_PERCENTUAL\` text NOT NULL, \`ATE_10_SM_PERCENTUAL\` text NOT NULL, \`MAIS_DE_10_SM_PERCENTUAL\` text NOT NULL, \`MES\` int NOT NULL, \`ANO\` int NOT NULL, \`REGIAO\` enum ('BR', 'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO') NOT NULL, \`METODO\` enum ('Planilha', 'Web Scraping') NOT NULL, \`DATA_INSERCAO\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`metadados_icf\` (\`id\` varchar(36) NOT NULL, \`TIPOINDICE\` text NOT NULL, \`CAMPO\` text NOT NULL, \`TOTAL\` text NOT NULL, \`ATE_10_SM\` text NOT NULL, \`MAIS_DE_10_SM\` text NOT NULL, \`INDICE\` tinyint NOT NULL, \`DATA_INSERCAO\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`icf_id\` varchar(36) NOT NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`metadados_peic\` ADD CONSTRAINT \`FK_3daec2728555d244cb2662d9b41\` FOREIGN KEY (\`peic_id\`) REFERENCES \`peics\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`metadados_icec\` ADD CONSTRAINT \`FK_3f090c1941512b68f1642f350a5\` FOREIGN KEY (\`icec_id\`) REFERENCES \`icecs\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`metadados_icf\` ADD CONSTRAINT \`FK_fe40e047553de92664265facbc7\` FOREIGN KEY (\`icf_id\`) REFERENCES \`icfs\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`metadados_icf\` DROP FOREIGN KEY \`FK_fe40e047553de92664265facbc7\``);
        await queryRunner.query(`ALTER TABLE \`metadados_icec\` DROP FOREIGN KEY \`FK_3f090c1941512b68f1642f350a5\``);
        await queryRunner.query(`ALTER TABLE \`metadados_peic\` DROP FOREIGN KEY \`FK_3daec2728555d244cb2662d9b41\``);
        await queryRunner.query(`DROP TABLE \`metadados_icf\``);
        await queryRunner.query(`DROP TABLE \`icfs\``);
        await queryRunner.query(`DROP TABLE \`metadados_icec\``);
        await queryRunner.query(`DROP TABLE \`icecs\``);
        await queryRunner.query(`DROP TABLE \`peics\``);
        await queryRunner.query(`DROP TABLE \`metadados_peic\``);
    }

}
