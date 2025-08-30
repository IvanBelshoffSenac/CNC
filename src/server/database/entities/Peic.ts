import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { Metodo, Regiao } from "../../shared/interfaces";
import { MetadadosPeic } from "./metadadosPeic";

@Entity('peics')
export class Peic {
    @PrimaryGeneratedColumn("uuid")
    id?: string

    @Column({ type: 'text', nullable: false })
    ENDIVIDADOS_PERCENTUAL: string

    @Column({ type: 'text', nullable: false })
    CONTAS_EM_ATRASO_PERCENTUAL: string

    @Column({ type: 'text', nullable: false })
    NÃO_TERAO_CONDICOES_DE_PAGAR_PERCENTUAL: string

    @Column({ type: "text", nullable: false })
    ENDIVIDADOS_ABSOLUTO: string

    @Column({ type: "text", nullable: false })
    CONTAS_EM_ATRASO_ABSOLUTO: string

    @Column({ type: "text", nullable: false })
    NAO_TERÃO_CONDICOES_DE_PAGAR_ABSOLUTO: string

    @Column({ type: 'int', nullable: false })
    MES: number

    @Column({ type: 'int', nullable: false })
    ANO: number

    @Column({ nullable: false, type: 'enum', enum: Regiao })
    REGIAO: Regiao;

    @Column({ nullable: false, type: 'enum', enum: Metodo })
    METODO: Metodo;

    @OneToMany(() => MetadadosPeic, (metadados) => metadados.peic, {
        onDelete: "CASCADE"
    })
    metadados?: MetadadosPeic[]

    @CreateDateColumn()
    DATA_INSERCAO?: Date
}