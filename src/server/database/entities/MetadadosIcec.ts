import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Icec } from "./Icec";

@Entity('metadados_icec')
export class MetadadosIcec {
    @PrimaryGeneratedColumn("uuid")
    id?: string

    @Column({ type: 'text', nullable: false })
    TIPOINDICE: string

    @Column({ type: 'text', nullable: false })
    CAMPO: string

    @Column({ type: 'text', nullable: false })
    TOTAL: string

    @Column({ type: 'text', nullable: false })
    EMPRESAS_COM_ATÉ_50_EMPREGADOS: string

    @Column({ type: 'text', nullable: false })
    EMPRESAS_COM_MAIS_DE_50_EMPREGADOS: string

    @Column({ type: 'text', nullable: false })
    SEMIDURAVEIS: string

    @Column({ type: 'text', nullable: false })
    NAO_DURAVEIS: string

    @Column({ type: 'text', nullable: false })
    DURAVEIS: string

    @Column({ type: 'boolean', nullable: false })
    INDICE: boolean

    @ManyToOne(() => Icec, (icec) => icec.metadados, { nullable: false })
    @JoinColumn({ name: 'icec_id' })
    icec: Icec

    @CreateDateColumn()
    DATA_INSERCAO?: Date

}
