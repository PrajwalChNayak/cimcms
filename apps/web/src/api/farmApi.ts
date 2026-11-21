import { baseApi } from "@api/baseApi";
import type { ApiResponse, PaginatedResponse } from "@appTypes/api.types";
import type {
  CreateFarmRequest,
  Farm,
  GetFarmsParams,
  UpdateFarmRequest,
} from "@appTypes/farm.types";

export const farmApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getFarms: builder.query<
      ApiResponse<PaginatedResponse<Farm>>,
      GetFarmsParams
    >({
      query: (params) => ({
        url: "/farms",
        params,
      }),
      providesTags: ["Farm"],
    }),

    getFarmById: builder.query<ApiResponse<Farm>, string>({
      query: (id) => `/farms/${id}`,
      providesTags: (_result, _error, id) => [{ type: "Farm", id }],
    }),

    createFarm: builder.mutation<ApiResponse<Farm>, CreateFarmRequest>({
      query: (body) => ({
        url: "/farms",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Farm"],
    }),

    updateFarm: builder.mutation<
      ApiResponse<Farm>,
      { id: string; body: UpdateFarmRequest }
    >({
      query: ({ id, body }) => ({
        url: `/farms/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "Farm", id },
        "Farm",
      ],
    }),

    deleteFarm: builder.mutation<ApiResponse<void>, string>({
      query: (id) => ({
        url: `/farms/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Farm"],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetFarmsQuery,
  useGetFarmByIdQuery,
  useCreateFarmMutation,
  useUpdateFarmMutation,
  useDeleteFarmMutation,
  useLazyGetFarmsQuery,
} = farmApi;
