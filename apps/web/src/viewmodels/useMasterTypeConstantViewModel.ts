import { useMasterTypeConstantRepository } from "@repository/masterTypeConstantRepository";
import { useCallback } from "react";

export const useMasterTypeConstantViewModel = () => {
  const {
    masterTypeConstants,
    state,
    loadPage,
    runServerSearch,
    page,
    createConstant,
    isCreating,
  } = useMasterTypeConstantRepository();

  const data = masterTypeConstants?.data ?? [];
  const pagination = masterTypeConstants?.pagination;

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
    createConstant,
    isCreating,
  };
};
