import {
  useCreateFarmMutation,
  useDeleteFarmMutation,
  useGetFarmsQuery,
  useUpdateFarmMutation,
} from "@api/farmApi";
import type { ApiResponse } from "@appTypes/api.types";
import type {
  CreateFarmRequest,
  Farm,
  GetFarmsParams,
  UpdateFarmRequest,
} from "@appTypes/farm.types";
import { useCallback, useRef, useState } from "react";

const PAGE_LIMIT = 10;

export const useFarmRepository = (params?: GetFarmsParams) => {
  const [page, setPage] = useState(1);
  const isFetchingRef = useRef(false);

  const getFarmsResult = useGetFarmsQuery({
    page,
    limit: PAGE_LIMIT,
    ...params,
  });

  const [createFarmMutation, createFarmState] = useCreateFarmMutation();
  const [updateFarmMutation, updateFarmState] = useUpdateFarmMutation();
  const [deleteFarmMutation, deleteFarmState] = useDeleteFarmMutation();

  const createFarm = useCallback(
    (body: CreateFarmRequest): Promise<ApiResponse<Farm>> => {
      if (isFetchingRef.current)
        return Promise.reject(new Error("Request in progress"));
      isFetchingRef.current = true;
      return createFarmMutation(body)
        .unwrap()
        .finally(() => {
          isFetchingRef.current = false;
        });
    },
    [createFarmMutation],
  );

  const updateFarm = useCallback(
    (id: string, body: UpdateFarmRequest): Promise<ApiResponse<Farm>> =>
      updateFarmMutation({ id, body }).unwrap(),
    [updateFarmMutation],
  );

  const deleteFarm = useCallback(
    (id: string): Promise<ApiResponse<void>> => deleteFarmMutation(id).unwrap(),
    [deleteFarmMutation],
  );

  const loadPage = useCallback((pageNum: number) => {
    setPage(pageNum);
  }, []);

  return {
    farms: getFarmsResult.data?.result,
    getFarmsState: {
      isLoading: getFarmsResult.isLoading,
      isFetching: getFarmsResult.isFetching,
      error: getFarmsResult.error,
    },
    createFarm,
    createFarmState: {
      isLoading: createFarmState.isLoading,
      error: createFarmState.error,
    },
    updateFarm,
    updateFarmState: {
      isLoading: updateFarmState.isLoading,
      error: updateFarmState.error,
    },
    deleteFarm,
    deleteFarmState: {
      isLoading: deleteFarmState.isLoading,
      error: deleteFarmState.error,
    },
    page,
    hasMore: page < (getFarmsResult.data?.result.totalPages ?? 1),
    loadPage,
    PAGE_LIMIT,
  };
};
