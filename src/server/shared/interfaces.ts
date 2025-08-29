export interface IPeriod {
    mes: number;
    ano: number;
}

export enum Regiao {
    BR = 'BR',
    AC = 'AC',
    AL = 'AL',
    AP = 'AP',
    AM = 'AM',
    BA = 'BA',
    CE = 'CE',
    DF = 'DF',
    ES = 'ES',
    GO = 'GO',
    MA = 'MA',
    MT = 'MT',
    MS = 'MS',
    MG = 'MG',
    PA = 'PA',
    PB = 'PB',
    PR = 'PR',
    PE = 'PE',
    PI = 'PI',
    RJ = 'RJ',
    RN = 'RN',
    RS = 'RS',
    RO = 'RO',
    RR = 'RR',
    SC = 'SC',
    SP = 'SP',
    SE = 'SE',
    TO = 'TO'
}

export enum Metodo {
    PLA = 'Planilha',
    WS = 'Web Scraping'
}

export interface IErrorService {
    regiao: string;
    mes: number;
    ano: number;
}

export interface ITask {
    mes: number;
    ano: number;
    regiao: string;
    status: 'Sucesso' | 'Falha';
    servico: 'ICF' | 'ICEC' | 'PEIC';
    metodo: Metodo;
    erro?: string;
}

export interface IServiceResult {
    servico: 'ICF' | 'ICEC' | 'PEIC';
    periodoInicio: string;
    periodoFim: string;
    tempoExecucao: number; // em segundos
    tasks: ITask[];
    totalRegistros: number;
    registrosPlanilha: number;
    registrosWebScraping: number;
    sucessos: number;
    falhas: number;
    modoExecucao?: 'Agendado' | 'Forçado';
}

export interface icfXLSXSubtipos {
    tipo: string;
    indice: boolean;
    total: number;
    "até 10sm - %": number;
    "mais de 10sm - %": number;
}

export interface icfXLSXTipo {
    tipo: string;
    valores: icfXLSXSubtipos[];
}

export interface icfXLSXCompleta {
    icftableTipo: icfXLSXTipo[];
}
