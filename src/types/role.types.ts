export interface Role {
  id: string;
  name: string;
  status: string;
  createdAt?: string;
}

export interface RolePaginatedResult<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface GetRolesParams {
  page?: number;
  limit?: number;
  name?: string;
  status?: string;
  [key: string]: string | number | undefined;
}

export interface CreateRoleBody {
  name: string;
  status: string;
}
