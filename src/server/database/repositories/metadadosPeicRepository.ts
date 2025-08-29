import { AppDataSource } from '../data-source';
import { MetadadosPeic } from '../entities/metadadosPeic';

export const metadadosPeicRepository = AppDataSource.getRepository(MetadadosPeic);
