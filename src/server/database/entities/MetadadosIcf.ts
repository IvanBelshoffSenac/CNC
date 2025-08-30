import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Icf } from "./Icf";

@Entity('metadados_icf')
export class MetadadosIcf {
    @PrimaryGeneratedColumn("uuid")
    id?: string

    @Column({ type: 'text', nullable: false })
    TIPOINDICE: string

    @Column({ type: 'text', nullable: false })
    CAMPO: string

    @Column({ type: 'text', nullable: false })
    TOTAL: string

    @Column({ type: 'text', nullable: false })
    ATE_10_SM: string

    @Column({ type: 'text', nullable: false })
    MAIS_DE_10_SM: string

    @Column({ type: 'boolean', nullable: false })
    INDICE: boolean

    @ManyToOne(() => Icf, (icf) => icf.metadados, { nullable: false })
    @JoinColumn({ name: 'icf_id' })
    icf: Icf

    @CreateDateColumn()
    DATA_INSERCAO?: Date

}
