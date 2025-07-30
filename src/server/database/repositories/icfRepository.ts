import { AppDataSource } from "../data-source";
import { Icf } from "../entities";

export const icfRepository = AppDataSource.getRepository(Icf);