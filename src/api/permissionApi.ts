import { baseApi } from "@api/baseApi";
import type { ApiResponse } from "@appTypes/api.types";
import type {
  CreatePermissionBody,
  GetPermissionsParams,
  Permission,
  PermissionPaginatedResult,
} from "@appTypes/permission.types";

export const permissionApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getPermissions: builder.query<
      ApiResponse<PermissionPaginatedResult<Permission>>,
      GetPermissionsParams | void
    >({
      query: (params) => ({
        url: "user/permission",
        params: params ?? {},
      }),
      providesTags: ["Permission"],
    }),
    createPermission: builder.mutation<
      ApiResponse<Permission>,
      CreatePermissionBody
    >({
      query: (body) => ({
        url: "user/permission",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Permission"],
    }),
  }),
  overrideExisting: false,
});

export const { useGetPermissionsQuery, useCreatePermissionMutation } =
  permissionApi;
