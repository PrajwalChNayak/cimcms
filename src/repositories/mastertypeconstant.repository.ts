import prisma from "@models/prisma.client";
import BaseRepository, {
  type FieldMappings,
} from "@repositories/base.repository";

class MasterTypeConstantRepository extends BaseRepository {
  static override _modelName = "masterTypeConstant";

  static override _fieldMappings: FieldMappings = {
    exact: ["type"],
    text: ["name"],
    date: ["createdAt", "updatedAt"],
  };

  static override _defaultWhere: Record<string, unknown> = {};

  static async findDistinctTypes(): Promise<string[]> {
    const types = await prisma.masterTypeConstant.findMany({
      distinct: ["type"],
      select: { type: true },
    });

    return types.map((entry) => entry.type);
  }
}

export default MasterTypeConstantRepository;
