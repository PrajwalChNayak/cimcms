export interface MasterTypeConstantInfo {
  label: string;
  category?: string;
  unit?: string;
  level?: string;
  description?: string;
}

export interface MasterTypeConstant {
  id: string;
  type: string;
  value: string;
  info: MasterTypeConstantInfo;
  createdAt: string;
  updatedAt: string;
}

export interface MasterPaginatedResult<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface GetMasterTypeConstantsParams {
  type?: string;
  page?: number;
  limit?: number;
  [key: string]: string | number | undefined;
}

export interface CreateMasterTypeConstantBody {
  type: string;
  value: string;
  info: Record<string, string>;
}
