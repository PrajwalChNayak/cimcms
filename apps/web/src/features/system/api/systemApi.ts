import { baseApi } from "@api/baseApi";
import { commandDtoSchema, type CommandDto } from "@cimcms/contracts";
import { apiResponseSchema, parseResponse } from "@shared/utils/apiSchemas";
import { z } from "zod";

const statusSchema = apiResponseSchema(
  z.object({
    status: z.enum(["ok", "unavailable"]),
    mongo: z.enum(["up", "down"]),
    mqtt: z.enum(["up", "down"]),
  }),
);
export type SystemStatus = z.infer<typeof statusSchema>["result"];

const commandSchema = apiResponseSchema(commandDtoSchema);

export const systemApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    /** Admin only (DEVICE_MANAGE): backend dependency health, same facts as /health/ready. */
    getSystemStatus: builder.query<SystemStatus, void>({
      query: () => "/system/status",
      transformResponse: (raw: unknown) =>
        parseResponse(statusSchema, raw, "GET /system/status").result,
    }),
    /** DEVICE_DIAGNOSTICS: ask the device to sync its real-time clock now. */
    syncDeviceRtc: builder.mutation<CommandDto, { deviceObjectId: string }>({
      query: ({ deviceObjectId }) => ({
        url: `/devices/${deviceObjectId}/rtc-sync`,
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      }),
      transformResponse: (raw: unknown) =>
        parseResponse(commandSchema, raw, "POST /devices/:id/rtc-sync").result,
    }),
  }),
  overrideExisting: false,
});

export const { useGetSystemStatusQuery, useSyncDeviceRtcMutation } = systemApi;
