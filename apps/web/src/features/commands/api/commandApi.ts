import { commandDtoSchema, type CommandDto, type SubmitCommandBody } from "@cimcms/contracts";
import { baseApi } from "@api/baseApi";
import { apiResponseSchema, parseResponse } from "@shared/utils/apiSchemas";

const commandResponseSchema = apiResponseSchema(commandDtoSchema);

export interface SubmitCommandArgs {
  /** Database id (UUID) of the device (REST path, D-8) */
  deviceObjectId: string;
  body: SubmitCommandBody;
}

export const commandApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    /**
     * POST /devices/:id/commands. `query()` runs once per click, so each click
     * gets its own Idempotency-Key (plan T3.4). The server answers 202 with the
     * new CommandDto (200 with the existing one for a repeated key).
     */
    submitCommand: builder.mutation<CommandDto, SubmitCommandArgs>({
      query: ({ deviceObjectId, body }) => ({
        url: `/devices/${deviceObjectId}/commands`,
        method: "POST",
        body,
        headers: { "Idempotency-Key": crypto.randomUUID() },
      }),
      transformResponse: (raw: unknown) =>
        parseResponse(commandResponseSchema, raw, "POST /devices/:id/commands")
          .result,
    }),

    getCommand: builder.query<CommandDto, string>({
      query: (commandId) => `/commands/${commandId}`,
      transformResponse: (raw: unknown) =>
        parseResponse(commandResponseSchema, raw, "GET /commands/:commandId")
          .result,
    }),
  }),
  overrideExisting: false,
});

export const { useSubmitCommandMutation, useGetCommandQuery } = commandApi;
