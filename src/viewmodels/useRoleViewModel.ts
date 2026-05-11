import { useRoleRepository } from "@repository/roleRepository";
import { useCallback } from "react";

export const useRoleViewModel = () => {
  const {
    roles,
    state,
    loadPage,
    runServerSearch,
    page,
    createRole,
    isCreating,
  } = useRoleRepository();

  const data = roles?.data ?? [];
  const pagination = roles?.pagination;

  const handleServerSearch = useCallback(
    (_queryString: string, params: Record<string, string>) => {
      runServerSearch(params);
    },
    [runServerSearch],
  );

  return {
    data,
    pagination,
    isLoading: state.isLoading,
    isFetching: state.isFetching,
    error: state.error,
    page,
    loadPage,
    handleServerSearch,
    createRole,
    isCreating,
  };
};
