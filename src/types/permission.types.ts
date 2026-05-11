export interface Permission {
  id: string;
  name: string;
  status: string;
  createdAt?: string;
}

export interface PermissionPaginatedResult<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface GetPermissionsParams {
  page?: number;
  limit?: number;
  name?: string;
  status?: string;
  [key: string]: string | number | undefined;
}

export interface CreatePermissionBody {
  name: string;
  status: string;
}
