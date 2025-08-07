import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
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

    @CreateDateColumn()
    DATA_INSERCAO?: Date
}