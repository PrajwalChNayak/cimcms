import type { PaginationParams } from "@appTypes/api.types";

// Domain model
export interface Farm {
  id: string;
  name: string;
  location: string;
  description?: string;
  ownerId: string;
  imageUrl?: string;
  area?: string; // e.g. "120 ha"
  createdAt: string;
  updatedAt: string;
}

// Computed view model (enriched with device stats)
export interface FarmSummary extends Farm {
  totalDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  alertCount: number;
}

// Request DTOs
export interface CreateFarmRequest {
  name: string;
  location: string;
}

export interface UpdateFarmRequest {
  name?: string;
  location?: string;
}

export type GetFarmsParams = PaginationParams;

// Form state
export interface FarmFormState {
  name: string;
  location: string;
}

export interface FarmFormErrors {
  name?: string;
  location?: string;
}
