export enum Regiao {
    ES = 'ES',
    BR = 'BR'
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
