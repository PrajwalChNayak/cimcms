import { useLogoutMutation } from "@api/authApi";
import { baseApi } from "@api/baseApi";
import { useAppDispatch } from "@store/hooks";
import { logout } from "@store/slices/authSlice";
import { useCallback } from "react";

/** Revokes the refresh cookie server-side (best effort), then clears local state. */
export const useSignOut = () => {
  const dispatch = useAppDispatch();
  const [logoutMutation] = useLogoutMutation();

  return useCallback(async () => {
    try {
      await logoutMutation().unwrap();
    } catch {
      // Server unreachable or session already gone: still sign out locally.
    }
    dispatch(logout());
    dispatch(baseApi.util.resetApiState());
  }, [dispatch, logoutMutation]);
};
