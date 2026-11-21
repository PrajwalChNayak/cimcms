import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";

type ToastType = "info" | "success" | "warning" | "error";
type ToastPosition =
  | "top-right"
  | "top-left"
  | "bottom-right"
  | "bottom-left"
  | "top-center"
  | "bottom-center";

export interface Toast {
  id: number;
  type: ToastType;
  message?: string;
  autoClose: boolean;
  duration: number;
  position: ToastPosition;
  showIcon: boolean;
  showProgress: boolean;
  [key: string]: unknown;
}

interface ToastState {
  toasts: Toast[];
}

const initialState: ToastState = {
  toasts: [],
};

const toastSlice = createSlice({
  name: "toast",
  initialState,
  reducers: {
    addToast: (
      state,
      action: PayloadAction<Partial<Toast> & { id?: number }>,
    ) => {
      const id = action.payload.id ?? Date.now() + Math.random();
      const toast: Toast = {
        type: "info",
        autoClose: true,
        duration: 5000,
        position: "top-right",
        showIcon: true,
        showProgress: true,
        ...action.payload,
        id,
      };
      state.toasts.push(toast);
    },
    removeToast: (state, action: PayloadAction<number>) => {
      state.toasts = state.toasts.filter(
        (toast) => toast.id !== action.payload,
      );
    },
    removeAllToasts: (state) => {
      state.toasts = [];
    },
    updateToast: (
      state,
      action: PayloadAction<Partial<Toast> & { id: number }>,
    ) => {
      const { id, ...updates } = action.payload;
      const toastIndex = state.toasts.findIndex((toast) => toast.id === id);
      if (toastIndex !== -1) {
        state.toasts[toastIndex] = { ...state.toasts[toastIndex], ...updates };
      }
    },
  },
});

export const { addToast, removeToast, removeAllToasts, updateToast } =
  toastSlice.actions;

// Selectors
export const selectToasts = (state: { toast: ToastState }) =>
  state.toast.toasts;
export const selectToastById = (id: number) => (state: { toast: ToastState }) =>
  state.toast.toasts.find((toast) => toast.id === id);

export type { ToastState };
export default toastSlice.reducer;
