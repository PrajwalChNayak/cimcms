import { baseApi } from "@api/baseApi";
import {
  deviceReadinessDtoSchema,
  type DeviceReadinessDto,
} from "@cimcms/contracts";
import { apiResponseSchema, parseResponse } from "@shared/utils/apiSchemas";

const schema = apiResponseSchema(deviceReadinessDtoSchema);

export const readinessApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    /** AUTO / EXPERIMENT readiness of one device (path uses the ObjectId, D-8). */
    getDeviceReadiness: builder.query<DeviceReadinessDto, string>({
      query: (id) => `/devices/${id}/readiness`,
      transformResponse: (raw: unknown) =>
        parseResponse(schema, raw, "GET /devices/:id/readiness").result,
      providesTags: (_r, _e, id) => [{ type: "Readiness", id }],
    }),
  }),
  overrideExisting: false,
});

export const { useGetDeviceReadinessQuery } = readinessApi;
