import type { CurrentUserDto } from "@cimcms/contracts";

// Domain model (from contracts: id, email, name?, roles[], permissions[])
export type User = CurrentUserDto;

// Request DTOs
export interface LoginRequest {
  email: string;
  password: string;
}

// Response DTOs (inside the { statusCode, message, result } envelope).
// The refresh token is never in the body: it is an HttpOnly cookie.
export interface SessionResponse {
  accessToken: string;
  user: CurrentUserDto;
}
export type LoginResponse = SessionResponse;
export type RefreshResponse = SessionResponse;
export type MeResponse = CurrentUserDto;

// Form state
export interface LoginFormState {
  email: string;
  password: string;
}

export interface LoginFormErrors {
  email?: string;
  password?: string;
}
