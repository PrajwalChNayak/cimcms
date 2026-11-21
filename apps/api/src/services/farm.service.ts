import type { Farm } from '@prisma/client';
import FarmRepository from '@repositories/farm.repository';
import { NotFoundError } from '@utils/errors/custom.errors';

type FarmCreateInput = Omit<Farm, 'id' | 'createdAt' | 'updatedAt'>;

class FarmService {
  static async createFarm(data: FarmCreateInput): Promise<Farm> {
    return FarmRepository.create<Farm>(data as Record<string, unknown>);
  }

  static async getFarmsByConsumerId(
    page: number,
    limit: number,
    consumerId: string,
    name?: string,
    address?: string,
  ) {
    return FarmRepository.findAllMongo<Farm>(page, limit, { consumerId, name, address });
  }

  static async getFarmById(id: string): Promise<Farm> {
    const farm = await FarmRepository.findOne<Farm>(
      { id },
      {
        include: { devices: true },
      },
    );
    if (!farm) throw new NotFoundError('Farm not found');
    return farm;
  }

  static async updateFarm(id: string, data: Partial<FarmCreateInput>): Promise<Farm> {
    const existing = await FarmRepository.findOne<Farm>({ id });
    if (!existing) throw new NotFoundError('Farm not found');
    return FarmRepository.updateById<Farm>(
      id,
      data as Record<string, unknown>,
    );
  }

  static async deleteFarm(id: string): Promise<Farm> {
    const existing = await FarmRepository.findOne<Farm>({ id });
    if (!existing) throw new NotFoundError('Farm not found');
    return FarmRepository.deleteById<Farm>(id, false);
  }
}

export default FarmService;
