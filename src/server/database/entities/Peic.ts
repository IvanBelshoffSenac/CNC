import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Regiao } from "../../shared/interfaces";

@Entity('peics')
export class Peic {
    @PrimaryGeneratedColumn("uuid")
    id?: string

    @Column({ type: 'float', nullable: false })
    ENDIVIDADOS_PERCENTUAL: number

    @Column({ type: 'float', nullable: false })
    CONTAS_EM_ATRASO_PERCENTUAL: number

    @Column({ type: 'float', nullable: false })
    NÃO_TERAO_CONDICOES_DE_PAGAR_PERCENTUAL: number

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
    
    @CreateDateColumn()
    data_criacao: Date

    @UpdateDateColumn()
    data_atualizacao: Date
}