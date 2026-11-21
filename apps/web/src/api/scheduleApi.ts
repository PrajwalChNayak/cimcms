import { baseApi } from "@api/baseApi";
import type { PaginatedResponse } from "@appTypes/api.types";
import {
  scheduleDeviceStatusDtoSchema,
  scheduleDtoSchema,
  schedulePublishResultDtoSchema,
  scheduleVersionDtoSchema,
  type CreateScheduleBody,
  type ScheduleDeviceStatusDto,
  type ScheduleDto,
  type SchedulePublishResultDto,
  type ScheduleVersionDto,
  type UpdateScheduleBody,
} from "@cimcms/contracts";
import {
  apiResponseSchema,
  paginatedSchema,
  parseResponse,
} from "@shared/utils/apiSchemas";
import { z } from "zod";

const listSchema = apiResponseSchema(paginatedSchema(scheduleDtoSchema));
const oneSchema = apiResponseSchema(scheduleDtoSchema);
const versionsSchema = apiResponseSchema(z.array(scheduleVersionDtoSchema));
const devicesSchema = apiResponseSchema(z.array(scheduleDeviceStatusDtoSchema));
const publishSchema = apiResponseSchema(schedulePublishResultDtoSchema);

export interface ListSchedulesArgs {
  page?: number;
  limit?: number;
  roomId?: string;
  status?: ScheduleDto["status"];
}

export const scheduleApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listSchedules: builder.query<PaginatedResponse<ScheduleDto>, ListSchedulesArgs | void>({
      query: (params) => ({ url: "/schedules", params: params ?? undefined }),
      transformResponse: (raw: unknown) =>
        parseResponse(listSchema, raw, "GET /schedules").result,
      providesTags: [{ type: "Schedule", id: "LIST" }],
    }),
    getSchedule: builder.query<ScheduleDto, string>({
      query: (id) => `/schedules/${id}`,
      transformResponse: (raw: unknown) =>
        parseResponse(oneSchema, raw, "GET /schedules/:id").result,
      providesTags: (_r, _e, id) => [{ type: "Schedule", id }],
    }),
    getScheduleVersions: builder.query<ScheduleVersionDto[], string>({
      query: (id) => `/schedules/${id}/versions`,
      transformResponse: (raw: unknown) =>
        parseResponse(versionsSchema, raw, "GET /schedules/:id/versions").result,
      providesTags: (_r, _e, id) => [{ type: "Schedule", id: `${id}:versions` }],
    }),
    /** Latest config per device of the room: the device acknowledgement status. */
    getScheduleDevices: builder.query<ScheduleDeviceStatusDto[], string>({
      query: (id) => `/schedules/${id}/devices`,
      transformResponse: (raw: unknown) =>
        parseResponse(devicesSchema, raw, "GET /schedules/:id/devices").result,
      providesTags: (_r, _e, id) => [{ type: "Schedule", id: `${id}:devices` }],
    }),
    createSchedule: builder.mutation<ScheduleDto, CreateScheduleBody>({
      query: (body) => ({ url: "/schedules", method: "POST", body }),
      transformResponse: (raw: unknown) =>
        parseResponse(oneSchema, raw, "POST /schedules").result,
      invalidatesTags: [{ type: "Schedule", id: "LIST" }],
    }),
    updateSchedule: builder.mutation<ScheduleDto, { id: string; body: UpdateScheduleBody }>({
      query: ({ id, body }) => ({ url: `/schedules/${id}`, method: "PUT", body }),
      transformResponse: (raw: unknown) =>
        parseResponse(oneSchema, raw, "PUT /schedules/:id").result,
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Schedule", id },
        { type: "Schedule", id: `${id}:versions` },
        { type: "Schedule", id: "LIST" },
      ],
    }),
    publishSchedule: builder.mutation<SchedulePublishResultDto, string>({
      query: (id) => ({ url: `/schedules/${id}/publish`, method: "POST" }),
      transformResponse: (raw: unknown) =>
        parseResponse(publishSchema, raw, "POST /schedules/:id/publish").result,
      invalidatesTags: (_r, _e, id) => [
        { type: "Schedule", id },
        { type: "Schedule", id: `${id}:versions` },
        { type: "Schedule", id: `${id}:devices` },
        { type: "Schedule", id: "LIST" },
        { type: "Readiness" as const },
      ],
    }),
    archiveSchedule: builder.mutation<SchedulePublishResultDto, string>({
      query: (id) => ({ url: `/schedules/${id}/archive`, method: "POST" }),
      transformResponse: (raw: unknown) =>
        parseResponse(publishSchema, raw, "POST /schedules/:id/archive").result,
      invalidatesTags: (_r, _e, id) => [
        { type: "Schedule", id },
        { type: "Schedule", id: `${id}:devices` },
        { type: "Schedule", id: "LIST" },
      ],
    }),
  }),
  overrideExisting: false,
});

export const {
  useListSchedulesQuery,
  useGetScheduleQuery,
  useGetScheduleVersionsQuery,
  useGetScheduleDevicesQuery,
  useCreateScheduleMutation,
  useUpdateScheduleMutation,
  usePublishScheduleMutation,
  useArchiveScheduleMutation,
} = scheduleApi;
