import {
  useCreatePermissionMutation,
  useGetPermissionsQuery,
} from "@api/permissionApi";
import type { ApiResponse } from "@appTypes/api.types";
import type {
  CreatePermissionBody,
  GetPermissionsParams,
  Permission,
} from "@appTypes/permission.types";
import { useCallback, useState } from "react";

const PAGE_LIMIT = 10;

export const usePermissionRepository = (
  initialParams?: GetPermissionsParams,
) => {
  const [page, setPage] = useState(initialParams?.page ?? 1);
  const [searchParams, setSearchParams] = useState<Record<string, string>>({});

  const result = useGetPermissionsQuery({
    page,
    limit: PAGE_LIMIT,
    ...searchParams,
  });

  const [createPermissionMutation, createPermissionState] =
    useCreatePermissionMutation();

  const loadPage = useCallback((pageNum: number) => setPage(pageNum), []);

  const runServerSearch = useCallback((params: Record<string, string>) => {
    setSearchParams(params);
    setPage(1);
  }, []);

  const createPermission = useCallback(
    (body: CreatePermissionBody): Promise<ApiResponse<Permission>> =>
      createPermissionMutation(body).unwrap(),
    [createPermissionMutation],
  );

  return {
    permissions: result.data?.result,
    state: {
      isLoading: result.isLoading,
      isFetching: result.isFetching,
      error: result.error,
    },
    loadPage,
    runServerSearch,
    page,
    createPermission,
    isCreating: createPermissionState.isLoading,
  };
};
