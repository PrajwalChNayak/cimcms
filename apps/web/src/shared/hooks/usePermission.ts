import { useAppSelector } from "@store/hooks";
import { selectAuthPermissions } from "@store/slices/authSlice";

/** true when the signed-in user holds the named permission (e.g. `DEVICE_COMMAND`). */
export const usePermission = (name: string): boolean =>
  useAppSelector(selectAuthPermissions)?.includes(name) ?? false;

/** true when the signed-in user holds at least one of the named permissions. */
export const useHasAnyPermission = (...names: string[]): boolean => {
  const permissions = useAppSelector(selectAuthPermissions);
  return names.some((n) => permissions?.includes(n) ?? false);
};
