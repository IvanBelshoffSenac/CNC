import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { MetadadosIcf } from "./MetadadosIcf";
import { Metodo, Regiao } from "../../shared/interfaces";


@Entity('icfs')
export class Icf {
    @PrimaryGeneratedColumn("uuid")
    id?: string

    @Column({ type: 'float', nullable: false })
    NC_PONTOS: number

    @Column({ type: 'float', nullable: false })
    ATE_10_SM_PONTOS: number

    @Column({ type: 'float', nullable: false })
    MAIS_DE_10_SM_PONTOS: number

    @Column({ type: 'float', nullable: false })
    NC_PERCENTUAL: number

    @Column({ type: 'float', nullable: false })
    ATE_10_SM_PERCENTUAL: number

    @Column({ type: 'float', nullable: false })
    MAIS_DE_10_SM_PERCENTUAL: number

    @Column({ type: 'int', nullable: false })
    MES: number

    @Column({ type: 'int', nullable: false })
    ANO: number

    @Column({ nullable: false, type: 'enum', enum: Regiao })
    REGIAO: Regiao;

    @Column({ nullable: false, type: 'enum', enum: Metodo })
    METODO: Metodo;

    @OneToMany(() => MetadadosIcf, (metadados) => metadados.icf, {
        onDelete: "SET NULL"
    })
    metadados?: MetadadosIcf[]

    @CreateDateColumn()
    DATA_INSERCAO?: Date
}