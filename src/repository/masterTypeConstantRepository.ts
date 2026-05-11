import {
  useCreateMasterTypeConstantMutation,
  useGetMasterTypeConstantsQuery,
} from "@api/masterTypeConstantApi";
import type { ApiResponse } from "@appTypes/api.types";
import type {
  CreateMasterTypeConstantBody,
  GetMasterTypeConstantsParams,
  MasterTypeConstant,
} from "@appTypes/masterTypeConstant.types";
import { useCallback, useState } from "react";

const PAGE_LIMIT = 10;

export const useMasterTypeConstantRepository = (
  initialParams?: GetMasterTypeConstantsParams,
) => {
  const [page, setPage] = useState(initialParams?.page ?? 1);

  const [searchParams, setSearchParams] = useState<Record<string, string>>({});

  const result = useGetMasterTypeConstantsQuery({
    page,
    limit: PAGE_LIMIT,
    ...searchParams,
  });

  const [createMutation, createState] = useCreateMasterTypeConstantMutation();

  const createConstant = useCallback(
    (body: CreateMasterTypeConstantBody): Promise<ApiResponse<MasterTypeConstant>> =>
      createMutation(body).unwrap(),
    [createMutation],
  );

  const loadPage = (pageNum: number) => setPage(pageNum);

  const runServerSearch = (params: Record<string, string>) => {
    setSearchParams(params);
    setPage(1);
  };

  return {
    masterTypeConstants: result.data?.result,
    state: {
      isLoading: result.isLoading,
      isFetching: result.isFetching,
      error: result.error,
    },
    loadPage,
    runServerSearch,
    page,
    createConstant,
    isCreating: createState.isLoading,
  };
};
