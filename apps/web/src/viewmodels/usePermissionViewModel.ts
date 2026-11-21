import { usePermissionRepository } from "@repository/permissionRepository";
import { useCallback } from "react";

export const usePermissionViewModel = () => {
  const {
    permissions,
    state,
    loadPage,
    runServerSearch,
    page,
    createPermission,
    isCreating,
  } = usePermissionRepository();

  const data = permissions?.data ?? [];
  const pagination = permissions?.pagination;

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
    createPermission,
    isCreating,
  };
};
