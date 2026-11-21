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
   * (0 = somebody else got there first). `ack` is appended in the same atomic update.
   */
  static async transition(
    commandId: string,
    from: readonly CommandStatus[],
    data: Prisma.CommandUpdateManyMutationInput,
    ack?: CommandAckInput,
  ): Promise<number> {
    const { count } = await prisma.command.updateMany({
      where: { commandId, status: { in: [...from] } },
      data: { ...data, ...(ack && { acks: { push: ack } }) },
    });
    return count;
  }

  /** Appends an ack without touching the status. */
  static async appendAck(commandId: string, ack: CommandAckInput): Promise<void> {
    await prisma.command.updateMany({ where: { commandId }, data: { acks: { push: ack } } });
  }
}

export default CommandRepository;
