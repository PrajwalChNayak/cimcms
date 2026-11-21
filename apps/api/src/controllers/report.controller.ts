import AuditService from "@services/audit.service";
import ReportService, { istDate, type ReportRange } from "@services/report.service";
import type { Request, Response } from "express";

type ReportName = "relay-on-time" | "commands" | "availability";

const stream = async (
  req: Request,
  res: Response,
  name: ReportName,
  gen: AsyncGenerator<string>,
): Promise<void> => {
  const q = req.query as unknown as ReportRange;
  // The first chunk (header) is produced after lookups, so a 404 still goes through the error handler.
  const first = await gen.next();

  void AuditService.record({
    action: "REPORT_EXPORTED",
    entity: "Report",
    entityId: name,
    actorId: req.subject?.userId ?? null,
    actorEmail: req.subject?.email ?? null,
    data: { report: name, from: q.from, to: q.to, ...(q.deviceId && { deviceId: q.deviceId }) },
    ip: req.ip ?? null,
    requestId: req.requestId ?? null,
  });

  const filename = `${name}_${istDate(Date.parse(q.from))}_${istDate(Date.parse(q.to))}.csv`;
  res.status(200);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "no-store");

  const write = async (chunk: string): Promise<void> => {
    if (!res.write(chunk)) await new Promise<void>((resolve) => res.once("drain", resolve));
  };
  try {
    if (!first.done) await write(first.value);
    for await (const chunk of gen) {
      if (res.destroyed) break;
      await write(chunk);
    }
    res.end();
  } catch {
    // Headers are already sent: cut the connection so the client sees an incomplete download.
    res.destroy();
  }
};

class ReportController {
  static relayOnTime(req: Request, res: Response): Promise<void> {
    return stream(req, res, "relay-on-time", ReportService.relayOnTime(req.query as unknown as ReportRange));
  }
  static commands(req: Request, res: Response): Promise<void> {
    return stream(req, res, "commands", ReportService.commands(req.query as unknown as ReportRange));
  }
  static availability(req: Request, res: Response): Promise<void> {
    return stream(req, res, "availability", ReportService.availability(req.query as unknown as ReportRange));
  }
}

export default ReportController;
