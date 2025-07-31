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
