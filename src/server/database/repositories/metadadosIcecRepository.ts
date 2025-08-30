import { AppDataSource } from '../data-source';
import { MetadadosIcec } from '../entities/MetadadosIcec';

export const metadadosIcecRepository = AppDataSource.getRepository(MetadadosIcec);
