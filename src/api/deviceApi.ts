import { baseApi } from "@api/baseApi";
import type { ApiResponse, PaginatedResponse } from "@appTypes/api.types";
import type {
  CreateDeviceRequest,
  Device,
  GetDevicesParams,
  UpdateDeviceRequest,
} from "@appTypes/device.types";

export const deviceApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getDevices: builder.query<
      ApiResponse<PaginatedResponse<Device>>,
      GetDevicesParams
    >({
      query: (params) => ({
        url: "/devices",
        params,
      }),
      providesTags: ["Device"],
    }),

    getDeviceById: builder.query<ApiResponse<Device>, string>({
      query: (id) => `/devices/${id}`,
      providesTags: (_result, _error, id) => [{ type: "Device", id }],
    }),

    createDevice: builder.mutation<ApiResponse<Device>, CreateDeviceRequest>({
      query: (body) => ({
        url: "/devices",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Device"],
    }),

    updateDevice: builder.mutation<
      ApiResponse<Device>,
      { id: string; body: UpdateDeviceRequest }
    >({
      query: ({ id, body }) => ({
        url: `/devices/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "Device", id },
        "Device",
      ],
    }),

    deleteDevice: builder.mutation<ApiResponse<void>, string>({
      query: (id) => ({
        url: `/devices/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Device"],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetDevicesQuery,
  useGetDeviceByIdQuery,
  useCreateDeviceMutation,
  useUpdateDeviceMutation,
  useDeleteDeviceMutation,
  useLazyGetDevicesQuery,
} = deviceApi;
