import {
  useCreateDeviceMutation,
  useDeleteDeviceMutation,
  useGetDevicesQuery,
  useUpdateDeviceMutation,
} from "@api/deviceApi";
import type { ApiResponse } from "@appTypes/api.types";
import type {
  CreateDeviceRequest,
  Device,
  GetDevicesParams,
  UpdateDeviceRequest,
} from "@appTypes/device.types";
import { useCallback, useRef, useState } from "react";

const PAGE_LIMIT = 10;

export const useDeviceRepository = (params?: GetDevicesParams) => {
  const [page, setPage] = useState(1);
  const isFetchingRef = useRef(false);

  const getDevicesResult = useGetDevicesQuery({
    page,
    limit: PAGE_LIMIT,
    ...params,
  });

  const [createDeviceMutation, createDeviceState] = useCreateDeviceMutation();
  const [updateDeviceMutation, updateDeviceState] = useUpdateDeviceMutation();
  const [deleteDeviceMutation, deleteDeviceState] = useDeleteDeviceMutation();

  const createDevice = useCallback(
    (body: CreateDeviceRequest): Promise<ApiResponse<Device>> => {
      if (isFetchingRef.current)
        return Promise.reject(new Error("Request in progress"));
      isFetchingRef.current = true;
      return createDeviceMutation(body)
        .unwrap()
        .finally(() => {
          isFetchingRef.current = false;
        });
    },
    [createDeviceMutation],
  );

  const updateDevice = useCallback(
    (id: string, body: UpdateDeviceRequest): Promise<ApiResponse<Device>> =>
      updateDeviceMutation({ id, body }).unwrap(),
    [updateDeviceMutation],
  );

  const deleteDevice = useCallback(
    (id: string): Promise<ApiResponse<void>> =>
      deleteDeviceMutation(id).unwrap(),
    [deleteDeviceMutation],
  );

  const loadPage = useCallback((pageNum: number) => {
    setPage(pageNum);
  }, []);

  return {
    devices: getDevicesResult.data?.result,
    getDevicesState: {
      isLoading: getDevicesResult.isLoading,
      isFetching: getDevicesResult.isFetching,
      error: getDevicesResult.error,
    },
    createDevice,
    createDeviceState: {
      isLoading: createDeviceState.isLoading,
      error: createDeviceState.error,
    },
    updateDevice,
    updateDeviceState: {
      isLoading: updateDeviceState.isLoading,
      error: updateDeviceState.error,
    },
    deleteDevice,
    deleteDeviceState: {
      isLoading: deleteDeviceState.isLoading,
      error: deleteDeviceState.error,
    },
    page,
    hasMore: page < (getDevicesResult.data?.result.totalPages ?? 1),
    loadPage,
    PAGE_LIMIT,
  };
};
