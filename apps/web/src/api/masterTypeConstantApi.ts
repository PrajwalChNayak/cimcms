import { baseApi } from "@api/baseApi";
import type { ApiResponse } from "@appTypes/api.types";
import type {
  CreateMasterTypeConstantBody,
  GetMasterTypeConstantsParams,
  MasterPaginatedResult,
  MasterTypeConstant,
} from "@appTypes/masterTypeConstant.types";

export const masterTypeConstantApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getMasterTypeConstants: builder.query<
      ApiResponse<MasterPaginatedResult<MasterTypeConstant>>,
      GetMasterTypeConstantsParams | void
    >({
      query: (params) => ({
        url: "master/constant",
        params: params ?? {},
      }),
      providesTags: ["MasterTypeConstant"],
    }),
    createMasterTypeConstant: builder.mutation<
      ApiResponse<MasterTypeConstant>,
      CreateMasterTypeConstantBody
    >({
      query: (body) => ({
        url: "master/constant",
        method: "POST",
        body,
      }),
      invalidatesTags: ["MasterTypeConstant"],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetMasterTypeConstantsQuery,
  useLazyGetMasterTypeConstantsQuery,
  useCreateMasterTypeConstantMutation,
} = masterTypeConstantApi;
