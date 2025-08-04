import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Metodo, Regiao } from "../../shared/interfaces";

@Entity('icecs')
export class Icec {
    @PrimaryGeneratedColumn("uuid")
    id?: string

    @Column({ type: 'float', nullable: false })
    ICEC: number

    @Column({ type: 'float', nullable: false })
    ATÉ_50: number

    @Column({ type: 'float', nullable: false })
    MAIS_DE_50: number

    @Column({ type: 'float', nullable: false })
    SEMIDURAVEIS: number

    @Column({ type: 'float', nullable: false })
    NAO_DURAVEIS: number

    @Column({ type: 'float', nullable: false })
    DURAVEIS: number

    @Column({ type: 'int', nullable: false })
    MES: number

    @Column({ type: 'int', nullable: false })
    ANO: number

    @Column({ nullable: false, type: 'enum', enum: Regiao })
    REGIAO: Regiao;

    @Column({ nullable: false, type: 'enum', enum: Metodo })
    METODO: Metodo;

    @CreateDateColumn()
    data_criacao?: Date
}