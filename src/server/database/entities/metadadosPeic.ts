import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Peic } from "./Peic";

@Entity('metadados_peic')
export class MetadadosPeic {
    @PrimaryGeneratedColumn("uuid")
    id?: string

    @Column({ type: 'varchar', nullable: false })
    tipoIndice: string

    @Column({ type: 'varchar', nullable: false })
    campo: string

    @Column({ type: 'float', nullable: false })
    TOTAL: number

    @Column({ type: 'float', nullable: false })
    ATE_10_SM: number

    @Column({ type: 'float', nullable: false })
    MAIS_DE_10_SM: number

    @Column({ type: 'float', nullable: false })
    NUMERO_ABSOLUTO: number;

    @ManyToOne(() => Peic, (peic) => peic.metadados, { nullable: false })
    @JoinColumn({ name: 'peic_id' })
    peic: Peic;

    @CreateDateColumn()
    DATA_INSERCAO?: Date

}
