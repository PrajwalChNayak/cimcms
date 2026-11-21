import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export const DEFAULT_PAGE_SIZE = 20;

export interface PaginationParams<K extends string> {
  page: number;
  pageSize: number;
  /** Current filter values from the URL ("" when unset). */
  filters: Record<K, string>;
  setPage: (page: number) => void;
  /** Replace all filters at once; blank values are removed and the page resets to 1. */
  setFilters: (next: Partial<Record<K, string>>) => void;
}

/**
 * Page number and filters kept in the URL query string (`?page=2&status=TIMEOUT`),
 * so a reload or a shared link shows the same list. Only the listed `filterKeys`
 * are read and written; other params are left alone.
 */
export function usePaginationParams<K extends string = never>(
  filterKeys: readonly K[] = [],
  pageSize: number = DEFAULT_PAGE_SIZE,
): PaginationParams<K> {
  const [params, setParams] = useSearchParams();

  const rawPage = Number(params.get("page"));
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;

  const keyList = filterKeys.join("|");
  const filterValues = filterKeys.map((k) => params.get(k) ?? "");
  const valueList = filterValues.join("\u0000");
  const filters = useMemo(
    () =>
      Object.fromEntries(
        keyList.split("|").filter(Boolean).map((k, i) => [k, filterValues[i]]),
      ) as Record<K, string>,
    // keyList and valueList fully describe the inputs
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [keyList, valueList],
  );

  const setPage = useCallback(
    (next: number) => {
      setParams((prev) => {
        const p = new URLSearchParams(prev);
        if (next <= 1) p.delete("page");
        else p.set("page", String(next));
        return p;
      });
    },
    [setParams],
  );

  const setFilters = useCallback(
    (next: Partial<Record<K, string>>) => {
      setParams((prev) => {
        const p = new URLSearchParams(prev);
        for (const key of keyList.split("|").filter(Boolean)) {
          const value = (next as Record<string, string | undefined>)[key] ?? "";
          if (value === "") p.delete(key);
          else p.set(key, value);
        }
        p.delete("page");
        return p;
      });
    },
    [setParams, keyList],
  );

  return { page, pageSize, filters, setPage, setFilters };
}
