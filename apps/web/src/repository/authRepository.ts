import { useLoginMutation } from "@api/authApi";
import type { ApiResponse } from "@appTypes/api.types";
import type { LoginRequest, LoginResponse } from "@appTypes/auth.types";
import { useCallback } from "react";

export const useAuthRepository = () => {
  const [loginMutation, loginState] = useLoginMutation();

  const login = useCallback(
    (credentials: LoginRequest): Promise<ApiResponse<LoginResponse>> =>
      loginMutation(credentials).unwrap(),
    [loginMutation],
  );

  const clearLoginError = useCallback(() => {
    loginState.reset();
  }, [loginState]);

  return {
    login,
    loginState: {
      isLoading: loginState.isLoading,
      error: loginState.error,
    },
    clearLoginError,
  };
};
