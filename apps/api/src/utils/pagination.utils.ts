export interface PaginationResult<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface PaginationParams {
  page: number;
  limit: number;
}

class PaginationUtils {
  static readonly #DEFAULT_PAGE = 1;
  static readonly #DEFAULT_LIMIT = 10;

  static getPaginationData<T>(
    data: T[],
    total: number,
    page: number,
    limit: number,
  ): PaginationResult<T> {
    return {
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static getSkipTake(
    page: number,
    limit: number,
  ): { skip: number; take: number } {
    const skip = (page - 1) * limit;
    return { skip, take: limit };
  }

  static getPaginationParams(query: Record<string, unknown>): PaginationParams {
    return {
      page: Math.max(+(query.page ?? PaginationUtils.#DEFAULT_PAGE), 1),
      limit: Math.max(+(query.limit ?? PaginationUtils.#DEFAULT_LIMIT), 1),
    };
  }
}

export default PaginationUtils;
