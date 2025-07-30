import { AppDataSource } from "../data-source";
import { Icec } from "../entities";

export const icecRepository = AppDataSource.getRepository(Icec);