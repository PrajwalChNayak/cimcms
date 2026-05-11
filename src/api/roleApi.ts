import { baseApi } from "@api/baseApi";
import type { ApiResponse } from "@appTypes/api.types";
import type {
  CreateRoleBody,
  GetRolesParams,
  Role,
  RolePaginatedResult,
} from "@appTypes/role.types";

export const roleApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getRoles: builder.query<
      ApiResponse<RolePaginatedResult<Role>>,
      GetRolesParams | void
    >({
      query: (params) => ({
        url: "user/role",
        params: params ?? {},
      }),
      providesTags: ["Role"],
    }),
    createRole: builder.mutation<ApiResponse<Role>, CreateRoleBody>({
      query: (body) => ({
        url: "user/role",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Role"],
    }),
  }),
  overrideExisting: false,
});

export const { useGetRolesQuery, useCreateRoleMutation } = roleApi;
