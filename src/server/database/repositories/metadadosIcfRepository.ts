import { AppDataSource } from "../data-source";
import { MetadadosIcf } from "../entities";

export const metadadosIcfRepository = AppDataSource.getRepository(MetadadosIcf);