import { baseApi } from "@api/baseApi";
import type { PaginatedResponse } from "@appTypes/api.types";
import {
  experimentActionResultDtoSchema,
  experimentDeviceStatusDtoSchema,
  experimentDtoSchema,
  experimentLogEntryDtoSchema,
  type CreateExperimentBody,
  type ExperimentActionResultDto,
  type ExperimentDeviceStatusDto,
  type ExperimentDto,
  type ExperimentLogEntryDto,
  type UpdateExperimentBody,
} from "@cimcms/contracts";
import {
  apiResponseSchema,
  paginatedSchema,
  parseResponse,
} from "@shared/utils/apiSchemas";
import { z } from "zod";

const listSchema = apiResponseSchema(paginatedSchema(experimentDtoSchema));
const oneSchema = apiResponseSchema(experimentDtoSchema);
const devicesSchema = apiResponseSchema(z.array(experimentDeviceStatusDtoSchema));
const logSchema = apiResponseSchema(z.array(experimentLogEntryDtoSchema));
const actionSchema = apiResponseSchema(experimentActionResultDtoSchema);

export type ExperimentAction = "ready" | "revert" | "resend" | "start" | "pause" | "resume" | "stop";

export const experimentApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listExperiments: builder.query<PaginatedResponse<ExperimentDto>, { page?: number; limit?: number; status?: ExperimentDto["status"] } | void>({
      query: (params) => ({ url: "/experiments", params: params ?? undefined }),
      transformResponse: (raw: unknown) =>
        parseResponse(listSchema, raw, "GET /experiments").result,
      providesTags: [{ type: "Experiment", id: "LIST" }],
    }),
    getExperiment: builder.query<ExperimentDto, string>({
      query: (id) => `/experiments/${id}`,
      transformResponse: (raw: unknown) =>
        parseResponse(oneSchema, raw, "GET /experiments/:id").result,
      providesTags: (_r, _e, id) => [{ type: "Experiment", id }],
    }),
    getExperimentDevices: builder.query<ExperimentDeviceStatusDto[], string>({
      query: (id) => `/experiments/${id}/devices`,
      transformResponse: (raw: unknown) =>
        parseResponse(devicesSchema, raw, "GET /experiments/:id/devices").result,
      providesTags: (_r, _e, id) => [{ type: "Experiment", id: `${id}:devices` }],
    }),
    getExperimentLog: builder.query<ExperimentLogEntryDto[], string>({
      query: (id) => `/experiments/${id}/events`,
      transformResponse: (raw: unknown) =>
        parseResponse(logSchema, raw, "GET /experiments/:id/events").result,
      providesTags: (_r, _e, id) => [{ type: "Experiment", id: `${id}:log` }],
    }),
    createExperiment: builder.mutation<ExperimentDto, CreateExperimentBody>({
      query: (body) => ({ url: "/experiments", method: "POST", body }),
      transformResponse: (raw: unknown) =>
        parseResponse(oneSchema, raw, "POST /experiments").result,
      invalidatesTags: [{ type: "Experiment", id: "LIST" }],
    }),
    updateExperiment: builder.mutation<ExperimentDto, { id: string; body: UpdateExperimentBody }>({
      query: ({ id, body }) => ({ url: `/experiments/${id}`, method: "PUT", body }),
      transformResponse: (raw: unknown) =>
        parseResponse(oneSchema, raw, "PUT /experiments/:id").result,
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Experiment", id },
        { type: "Experiment", id: "LIST" },
      ],
    }),
    /** ready / revert / resend / start / pause / resume / stop. */
    experimentAction: builder.mutation<ExperimentActionResultDto, { id: string; action: ExperimentAction }>({
      query: ({ id, action }) => ({ url: `/experiments/${id}/${action}`, method: "POST" }),
      transformResponse: (raw: unknown) =>
        parseResponse(actionSchema, raw, "POST /experiments/:id/:action").result,
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Experiment", id },
        { type: "Experiment", id: `${id}:devices` },
        { type: "Experiment", id: `${id}:log` },
        { type: "Experiment", id: "LIST" },
        { type: "Readiness" as const },
      ],
    }),
  }),
  overrideExisting: false,
});

export const {
  useListExperimentsQuery,
  useGetExperimentQuery,
  useGetExperimentDevicesQuery,
  useGetExperimentLogQuery,
  useCreateExperimentMutation,
  useUpdateExperimentMutation,
  useExperimentActionMutation,
} = experimentApi;
