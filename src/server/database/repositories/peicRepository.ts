import { AppDataSource } from "../data-source";
import { Peic } from "../entities";

export const peicRepository = AppDataSource.getRepository(Peic);