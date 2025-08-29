import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Icf } from "./Icf";

@Entity('metadados_icf')
export class MetadadosIcf {
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

    @Column({ type: 'boolean', nullable: false })
    indice: boolean

    @ManyToOne(() => Icf, (icf) => icf.metadados, { nullable: false })
    @JoinColumn({ name: 'icf_id' })
    icf: Icf

    @CreateDateColumn()
    DATA_INSERCAO?: Date

}
