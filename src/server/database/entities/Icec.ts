import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { Metodo, Regiao } from "../../shared/interfaces";
import { MetadadosIcec } from "./MetadadosIcec";

@Entity('icecs')
export class Icec {
    @PrimaryGeneratedColumn("uuid")
    id?: string

    @Column({ type: 'text', nullable: false })
    ICEC: string

    @Column({ type: 'text', nullable: false })
    ATÉ_50: string

    @Column({ type: 'text', nullable: false })
    MAIS_DE_50: string

    @Column({ type: 'text', nullable: false })
    SEMIDURAVEIS: string

    @Column({ type: 'text', nullable: false })
    NAO_DURAVEIS: string

    @Column({ type: 'text', nullable: false })
    DURAVEIS: string

    @Column({ type: 'int', nullable: false })
    MES: number

    @Column({ type: 'int', nullable: false })
    ANO: number

    @Column({ nullable: false, type: 'enum', enum: Regiao })
    REGIAO: Regiao;

    @Column({ nullable: false, type: 'enum', enum: Metodo })
    METODO: Metodo;

    @OneToMany(() => MetadadosIcec, (metadados) => metadados.icec, {
        onDelete: "CASCADE"
    })
    metadados?: MetadadosIcec[]

    @CreateDateColumn()
    DATA_INSERCAO?: Date
}