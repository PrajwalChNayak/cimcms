import type { CommandDto } from "@cimcms/contracts";
import { commandStatusText } from "@features/ledControl/ledText";

type Tone = "pending" | "ok" | "warn" | "bad";

const TONE_BY_STATUS: Record<CommandDto["status"], Tone> = {
  PENDING: "pending",
  PUBLISHED: "pending",
  ACCEPTED: "pending",
  EXECUTED: "ok",
  DUPLICATE: "warn",
  EXPIRED: "warn",
  TIMEOUT: "warn",
  REJECTED: "bad",
  FAILED: "bad",
  PUBLISH_FAILED: "bad",
};

const TONE_CLASS: Record<Tone, string> = {
  pending: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  ok: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  warn: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  bad: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
};

/** Result of a command in the exact section 9 words (never colour alone). */
export const CommandStatusPill = ({
  command,
}: {
  command: Pick<CommandDto, "status" | "reason" | "lateResult">;
}) => (
  <span
    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${TONE_CLASS[TONE_BY_STATUS[command.status]]}`}
    data-testid="command-status-pill"
    data-status={command.status}
  >
    {commandStatusText(command)}
  </span>
);
