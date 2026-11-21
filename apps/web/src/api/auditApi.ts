import { auditLogDtoSchema, type AuditLogDto } from "@cimcms/contracts";
import { baseApi } from "@api/baseApi";
import type { PaginatedResponse } from "@appTypes/api.types";
import {
  apiResponseSchema,
  paginatedSchema,
  parseResponse,
} from "@shared/utils/apiSchemas";

const auditListSchema = apiResponseSchema(paginatedSchema(auditLogDtoSchema));

export interface ListAuditArgs {
  page?: number;
  limit?: number;
  actorId?: string;
  action?: string;
  entity?: string;
  /** ISO UTC */
  from?: string;
  to?: string;
}

export const auditApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    /** GET /audit (AUDIT_READ), newest first. */
    listAudit: builder.query<PaginatedResponse<AuditLogDto>, ListAuditArgs | void>({
      query: (params) => ({ url: "/audit", params: params ?? undefined }),
      transformResponse: (raw: unknown) =>
        parseResponse(auditListSchema, raw, "GET /audit").result,
      providesTags: [{ type: "Audit", id: "LIST" }],
    }),
  }),
  overrideExisting: false,
});

export const { useListAuditQuery } = auditApi;
