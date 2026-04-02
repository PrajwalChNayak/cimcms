import MasterTypeConstantRepository from "@/repositories/mastertypeconstant.repository";
import PaginationUtils from "@/utils/pagination.utils";
import type { MasterTypeConstant } from "@prisma/client";

class MasterService {
  static async createMasterTypeConstant(data: {
    type: string;
    value: string;
    info?: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    const newConstant = await MasterTypeConstantRepository.create(data);

    return newConstant;
  }

  static async getMasterTypeConstants(query: {
    type?: string | string[];
    value?: string | string[];
    page?: string | string[];
    limit?: string | string[];
  }): Promise<{
    constants: Record<string, unknown>[];
    total: number;
  }> {
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
        orderBy: { createdAt: "desc" },
      },
    );
  }
}

export default MasterService;
