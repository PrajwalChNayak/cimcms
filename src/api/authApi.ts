import { baseApi } from "@api/baseApi";
import type { ApiResponse } from "@appTypes/api.types";
import type {
  LoginRequest,
  LoginResponse,
  MeResponse,
} from "@appTypes/auth.types";

export const authApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation<ApiResponse<LoginResponse>, LoginRequest>({
      query: (credentials) => ({
        url: "/user/login",
        method: "POST",
        body: credentials,
      }),
      invalidatesTags: ["Auth"],
    }),

    me: builder.query<ApiResponse<MeResponse>, void>({
      query: () => "/auth/me",
      providesTags: ["Auth"],
    }),
  }),
  overrideExisting: false,
});

export const { useLoginMutation, useMeQuery, useLazyMeQuery } = authApi;
