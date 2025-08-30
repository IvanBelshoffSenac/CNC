import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { MetadadosIcf } from "./MetadadosIcf";
import { Metodo, Regiao } from "../../shared/interfaces";


@Entity('icfs')
export class Icf {
    @PrimaryGeneratedColumn("uuid")
    id?: string

    @Column({ type: 'text', nullable: false })
    NC_PONTOS: string

    @Column({ type: 'text', nullable: false })
    ATE_10_SM_PONTOS: string

    @Column({ type: 'text', nullable: false })
    MAIS_DE_10_SM_PONTOS: string

    @Column({ type: 'text', nullable: false })
    NC_PERCENTUAL: string

    @Column({ type: 'text', nullable: false })
    ATE_10_SM_PERCENTUAL: string

    @Column({ type: 'text', nullable: false })
    MAIS_DE_10_SM_PERCENTUAL: string

    @Column({ type: 'int', nullable: false })
    MES: number

    @Column({ type: 'int', nullable: false })
    ANO: number

    @Column({ nullable: false, type: 'enum', enum: Regiao })
    REGIAO: Regiao;

    @Column({ nullable: false, type: 'enum', enum: Metodo })
    METODO: Metodo;

    @OneToMany(() => MetadadosIcf, (metadados) => metadados.icf, {
        onDelete: "CASCADE"
    })
    metadados?: MetadadosIcf[]

    @CreateDateColumn()
    DATA_INSERCAO?: Date
}