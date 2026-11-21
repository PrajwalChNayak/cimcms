import { useCreateRoleMutation, useGetRolesQuery } from "@api/roleApi";
import type { ApiResponse } from "@appTypes/api.types";
import type {
  CreateRoleBody,
  GetRolesParams,
  Role,
} from "@appTypes/role.types";
import { useCallback, useState } from "react";

const PAGE_LIMIT = 10;

export const useRoleRepository = (initialParams?: GetRolesParams) => {
  const [page, setPage] = useState(initialParams?.page ?? 1);
  const [searchParams, setSearchParams] = useState<Record<string, string>>({});

  const result = useGetRolesQuery({
    page,
    limit: PAGE_LIMIT,
    ...searchParams,
  });

  const [createRoleMutation, createRoleState] = useCreateRoleMutation();

  const loadPage = useCallback((pageNum: number) => setPage(pageNum), []);

  const runServerSearch = useCallback((params: Record<string, string>) => {
    setSearchParams(params);
    setPage(1);
  }, []);

  const createRole = useCallback(
    (body: CreateRoleBody): Promise<ApiResponse<Role>> =>
      createRoleMutation(body).unwrap(),
    [createRoleMutation],
  );

  return {
    roles: result.data?.result,
    state: {
      isLoading: result.isLoading,
      isFetching: result.isFetching,
      error: result.error,
    },
    loadPage,
    runServerSearch,
    page,
    createRole,
    isCreating: createRoleState.isLoading,
  };
};
