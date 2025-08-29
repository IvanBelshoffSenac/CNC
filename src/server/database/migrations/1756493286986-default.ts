import { MigrationInterface, QueryRunner } from "typeorm";

export class Default1756493286986 implements MigrationInterface {
    name = 'Default1756493286986'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`metadados_peic\` (\`id\` varchar(36) NOT NULL, \`tipoIndice\` varchar(255) NOT NULL, \`campo\` varchar(255) NOT NULL, \`TOTAL\` float NOT NULL, \`ATE_10_SM\` float NOT NULL, \`MAIS_DE_10_SM\` float NOT NULL, \`NUMERO_ABSOLUTO\` float NOT NULL, \`DATA_INSERCAO\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`peic_id\` varchar(36) NOT NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`metadados_peic\` ADD CONSTRAINT \`FK_3daec2728555d244cb2662d9b41\` FOREIGN KEY (\`peic_id\`) REFERENCES \`peics\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`metadados_peic\` DROP FOREIGN KEY \`FK_3daec2728555d244cb2662d9b41\``);
        await queryRunner.query(`DROP TABLE \`metadados_peic\``);
    }

}
