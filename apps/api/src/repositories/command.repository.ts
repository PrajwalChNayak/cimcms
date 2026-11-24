import prisma from "@models/prisma.client";
import type { CommandStatus, Prisma } from "@prisma/client";
import BaseRepository, { type FieldMappings } from "@repositories/base.repository";

export type CommandAckInput = {
  result: string;
  reason?: string | null;
  reportedState?: string | null;
  receivedAt: Date;
  deviceTs?: Date | null;
};

/** Every read that feeds CommandService.toDto must include the acks in arrival order. */
export const COMMAND_WITH_ACKS = { acks: { orderBy: { id: "asc" } } } as const satisfies Prisma.CommandInclude;

export type CommandWithAcks = Prisma.CommandGetPayload<{ include: typeof COMMAND_WITH_ACKS }>;

class CommandRepository extends BaseRepository {
  static override _modelName = "command";

  static override _fieldMappings: FieldMappings = {
    exact: ['deviceId', 'status', 'action', 'commandId', 'source'],
  };

  // No `status: CommonStatus` on this model.
  static override _defaultWhere: Record<string, unknown> = {};

  /**
   * Conditional status change (plan section 8, rule 2): applies `data` only if the
   * command is still in one of the `from` states. Returns the number of rows changed
   * (0 = somebody else got there first). `ack` is stored in the same transaction, and
   * only when the transition happened.
   */
  static async transition(
    commandId: string,
    from: readonly CommandStatus[],
    data: Prisma.CommandUpdateManyMutationInput,
    ack?: CommandAckInput,
  ): Promise<number> {
    return prisma.$transaction(async (tx) => {
      const { count } = await tx.command.updateMany({
        where: { commandId, status: { in: [...from] } },
        data,
      });
      if (count > 0 && ack) await tx.commandAck.create({ data: { commandId, ...ack } });
      return count;
    });
  }

  /** Appends an ack without touching the status. */
  static async appendAck(commandId: string, ack: CommandAckInput): Promise<void> {
    await prisma.commandAck.create({ data: { commandId, ...ack } });
  }
}

export default CommandRepository;
