import { currentUserDtoSchema } from "@cimcms/contracts";
import { z } from "zod";

/**
 * Zod helpers for the `{ statusCode, message, result }` envelope every
 * endpoint returns. Strict on `result`, tolerant on transport metadata.
 * (UI_ARCHITECTURE puts this in shared/api/; the real app keeps helpers in shared/utils.)
 */
export const apiResponseSchema = <T extends z.ZodType>(result: T) =>
  z.object({
    statusCode: z.number().optional().default(200),
    message: z.string().optional().default(""),
    result,
  });

/**
 * Paginated `result`. The API nests counters in `pagination` ({ data, pagination });
 * the flat shape ({ data, total, page, limit, totalPages }) is accepted too.
 * Output is always the flat PaginatedResponse shape the UI uses.
 */
export const paginatedSchema = <T extends z.ZodType>(item: T) => {
  const counters = {
    total: z.number(),
    page: z.number(),
    limit: z.number(),
    totalPages: z.number(),
  };
  return z
    .object({
      data: z.array(item),
      pagination: z.object(counters).optional(),
      total: counters.total.optional(),
      page: counters.page.optional(),
      limit: counters.limit.optional(),
      totalPages: counters.totalPages.optional(),
    })
    .transform((r) => ({
      data: r.data,
      total: r.pagination?.total ?? r.total ?? r.data.length,
      page: r.pagination?.page ?? r.page ?? 1,
      limit: r.pagination?.limit ?? r.limit ?? r.data.length,
      totalPages: r.pagination?.totalPages ?? r.totalPages ?? 1,
    }));
};

/** Parse a raw response; a schema mismatch becomes a readable Error. */
export function parseResponse<S extends z.ZodType>(
  schema: S,
  raw: unknown,
  label: string,
): z.output<S> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`Unexpected response from ${label}: ${detail}`);
  }
  return parsed.data;
}

/** Login / refresh response: { accessToken, user }. The refresh token is a cookie, never in the body. */
export const sessionResponseSchema = apiResponseSchema(
  z.object({ accessToken: z.string().min(1), user: currentUserDtoSchema }),
);
