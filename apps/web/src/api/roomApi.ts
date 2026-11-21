import { baseApi } from "@api/baseApi";
import type { PaginatedResponse } from "@appTypes/api.types";
import {
  roomChannelDtoSchema,
  roomChannelViewDtoSchema,
  roomDtoSchema,
  type CreateRoomBody,
  type ReplaceChannelsBody,
  type RoomChannelDto,
  type RoomChannelViewDto,
  type RoomDto,
  type UpdateRoomBody,
} from "@cimcms/contracts";
import {
  apiResponseSchema,
  paginatedSchema,
  parseResponse,
} from "@shared/utils/apiSchemas";
import { z } from "zod";

const listSchema = apiResponseSchema(paginatedSchema(roomDtoSchema));
const oneSchema = apiResponseSchema(roomDtoSchema);
const channelsSchema = apiResponseSchema(z.array(roomChannelDtoSchema));
const channelViewSchema = apiResponseSchema(z.array(roomChannelViewDtoSchema));

export interface ListRoomsArgs {
  page?: number;
  limit?: number;
  status?: "ACTIVE" | "INACTIVE";
  q?: string;
}

export const roomApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listRooms: builder.query<PaginatedResponse<RoomDto>, ListRoomsArgs | void>({
      query: (params) => ({ url: "/rooms", params: params ?? undefined }),
      transformResponse: (raw: unknown) =>
        parseResponse(listSchema, raw, "GET /rooms").result,
      providesTags: [{ type: "Room", id: "LIST" }],
    }),
    getRoom: builder.query<RoomDto, string>({
      query: (id) => `/rooms/${id}`,
      transformResponse: (raw: unknown) =>
        parseResponse(oneSchema, raw, "GET /rooms/:id").result,
      providesTags: (_r, _e, id) => [{ type: "Room", id }],
    }),
    createRoom: builder.mutation<RoomDto, CreateRoomBody>({
      query: (body) => ({ url: "/rooms", method: "POST", body }),
      transformResponse: (raw: unknown) =>
        parseResponse(oneSchema, raw, "POST /rooms").result,
      invalidatesTags: [{ type: "Room", id: "LIST" }],
    }),
    updateRoom: builder.mutation<RoomDto, { id: string; body: UpdateRoomBody }>({
      query: ({ id, body }) => ({ url: `/rooms/${id}`, method: "PUT", body }),
      transformResponse: (raw: unknown) =>
        parseResponse(oneSchema, raw, "PUT /rooms/:id").result,
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Room", id },
        { type: "Room", id: "LIST" },
        "RoomChannels",
      ],
    }),
    getRoomChannels: builder.query<RoomChannelDto[], string>({
      query: (id) => `/rooms/${id}/channels`,
      transformResponse: (raw: unknown) =>
        parseResponse(channelsSchema, raw, "GET /rooms/:id/channels").result,
      providesTags: (_r, _e, id) => [{ type: "RoomChannels", id }],
    }),
    replaceRoomChannels: builder.mutation<
      RoomChannelDto[],
      { id: string; body: ReplaceChannelsBody }
    >({
      query: ({ id, body }) => ({
        url: `/rooms/${id}/channels`,
        method: "PUT",
        body,
      }),
      transformResponse: (raw: unknown) =>
        parseResponse(channelsSchema, raw, "PUT /rooms/:id/channels").result,
      invalidatesTags: (_r, _e, { id }) => [
        { type: "RoomChannels", id },
        { type: "RoomChannels", id: "VIEW" },
        { type: "Room", id },
        { type: "Room", id: "LIST" },
      ],
    }),
    /** Every assignment with its room (channel picker, relay labels). */
    listRoomChannels: builder.query<RoomChannelViewDto[], { deviceId?: string } | void>({
      query: (params) => ({ url: "/room-channels", params: params ?? undefined }),
      transformResponse: (raw: unknown) =>
        parseResponse(channelViewSchema, raw, "GET /room-channels").result,
      providesTags: [{ type: "RoomChannels", id: "VIEW" }],
    }),
  }),
  overrideExisting: false,
});

export const {
  useListRoomsQuery,
  useGetRoomQuery,
  useCreateRoomMutation,
  useUpdateRoomMutation,
  useGetRoomChannelsQuery,
  useReplaceRoomChannelsMutation,
  useListRoomChannelsQuery,
} = roomApi;
