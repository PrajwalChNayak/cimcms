import MasterTypeConstantRepository from '@/repositories/mastertypeconstant.repository';
import PaginationUtils, { type PaginationResult } from '@/utils/pagination.utils';
import type { MasterTypeConstant } from '@prisma/client';

class MasterService {
  static async createMasterTypeConstant(data: {
    type: string;
    value: string;
    info?: Record<string, unknown>;
  }): Promise<MasterTypeConstant> {
    const newConstant = await MasterTypeConstantRepository.create<MasterTypeConstant>(data);

    return newConstant;
  }

  static async getMasterTypeConstants(query: {
    type?: string | string[];
    value?: string | string[];
    page?: string | string[];
    limit?: string | string[];
  }): Promise<PaginationResult<MasterTypeConstant>> {
    const { type, value } = query;

    const { page, limit } = PaginationUtils.getPaginationParams(query);

    const searchParams: Record<string, unknown> = {};

    if (type) searchParams.type = type;
    if (value) searchParams.value = value;

    return MasterTypeConstantRepository.findAll<MasterTypeConstant>(
      page,
      limit,
      searchParams,
      {
        additionalWhere: {},
        orderBy: { createdAt: 'desc' },
      },
    );
  }

  static async getMasterTypeConstantTypes(): Promise<string[]> {
    return await MasterTypeConstantRepository.findDistinctTypes();
  }
}

export default MasterService;
