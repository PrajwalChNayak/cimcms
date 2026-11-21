// Domain model
export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

// Redux slice state
export interface AuthSliceState {
  token: string | null;
  userId: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  isInitialized?: boolean;
  loginTime?: number | null;
}

// Request DTOs
export interface LoginRequest {
  email: string;
  password: string;
}

// Response DTOs
export interface LoginResponse {
  authToken: string;
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface MeResponse {
  id: string;
  email: string;
  name: string;
  role: string;
}

// Form state
export interface LoginFormState {
  email: string;
  password: string;
}

export interface LoginFormErrors {
  email?: string;
  password?: string;
}
