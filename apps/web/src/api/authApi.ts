import { currentUserDtoSchema } from "@cimcms/contracts";
import { baseApi } from "@api/baseApi";
import type { ApiResponse } from "@appTypes/api.types";
import type {
  LoginRequest,
  LoginResponse,
  MeResponse,
  RefreshResponse,
} from "@appTypes/auth.types";
import {
  apiResponseSchema,
  parseResponse,
  sessionResponseSchema,
} from "@shared/utils/apiSchemas";

const meResponseSchema = apiResponseSchema(currentUserDtoSchema);

export const authApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation<ApiResponse<LoginResponse>, LoginRequest>({
      query: (credentials) => ({
        url: "/user/login",
        method: "POST",
        body: credentials,
      }),
      transformResponse: (raw: unknown) =>
        parseResponse(sessionResponseSchema, raw, "POST /user/login"),
      invalidatesTags: ["Auth"],
    }),

    // Cookie-based: the HttpOnly refresh cookie is sent by `credentials: include`.
    refresh: builder.mutation<ApiResponse<RefreshResponse>, void>({
      query: () => ({ url: "/user/token/refresh", method: "POST" }),
      transformResponse: (raw: unknown) =>
        parseResponse(sessionResponseSchema, raw, "POST /user/token/refresh"),
    }),

    logout: builder.mutation<void, void>({
      query: () => ({ url: "/user/token/logout", method: "POST" }),
    }),

    me: builder.query<ApiResponse<MeResponse>, void>({
      query: () => "/user/me",
      transformResponse: (raw: unknown) =>
        parseResponse(meResponseSchema, raw, "GET /user/me"),
      providesTags: ["Auth"],
    }),
  }),
  overrideExisting: false,
});

export const {
  useLoginMutation,
  useRefreshMutation,
  useLogoutMutation,
  useMeQuery,
  useLazyMeQuery,
} = authApi;
