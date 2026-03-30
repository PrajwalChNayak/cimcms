import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";

type Theme = "light" | "dark";

interface Notification {
  id: number;
  timestamp: string;
  type: string;
  message?: string;
  [key: string]: unknown;
}

interface ModalState {
  isOpen: boolean;
  type: string | null;
  data: unknown;
}

interface Breadcrumb {
  label: string;
  path?: string;
  [key: string]: unknown;
}

interface UIState {
  notifications: Notification[];
  modals: ModalState;
  globalLoading: boolean;
  pageLoading: boolean;
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  theme: Theme;
  hasError: boolean;
  errorInfo: unknown;
  breadcrumbs: Breadcrumb[];
  pageTitle: string;
}

/**
 * UI state slice for managing global UI concerns
 * Handles modals, notifications, loading states, etc.
 */
const initialState: UIState = {
  notifications: [],
  modals: {
    isOpen: false,
    type: null,
    data: null,
  },
  globalLoading: false,
  pageLoading: false,
  sidebarOpen: true,
  sidebarCollapsed: false,
  theme: "light",
  hasError: false,
  errorInfo: null,
  breadcrumbs: [],
  pageTitle: "Dashboard",
};

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    // Notification actions
    showNotification: (
      state,
      action: PayloadAction<
        Omit<Notification, "id" | "timestamp"> &
          Partial<Pick<Notification, "id" | "timestamp">>
      >,
    ) => {
      const notification: Notification = {
        id: Date.now() + Math.random(),
        timestamp: new Date().toISOString(),
        ...action.payload,
      };
      state.notifications.push(notification);
    },

    hideNotification: (state, action: PayloadAction<number>) => {
      state.notifications = state.notifications.filter(
        (notification) => notification.id !== action.payload,
      );
    },

    clearNotifications: (state) => {
      state.notifications = [];
    },

    // Modal actions
    openModal: (
      state,
      action: PayloadAction<{ type: string; data?: unknown }>,
    ) => {
      const { type, data } = action.payload;
      state.modals.isOpen = true;
      state.modals.type = type;
      state.modals.data = data;
    },

    closeModal: (state) => {
      state.modals.isOpen = false;
      state.modals.type = null;
      state.modals.data = null;
    },

    // Loading actions
    setGlobalLoading: (state, action: PayloadAction<boolean>) => {
      state.globalLoading = action.payload;
    },

    setPageLoading: (state, action: PayloadAction<boolean>) => {
      state.pageLoading = action.payload;
    },

    // Sidebar actions
    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen;
    },

    setSidebarOpen: (state, action: PayloadAction<boolean>) => {
      state.sidebarOpen = action.payload;
    },

    toggleSidebarCollapsed: (state) => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },

    setSidebarCollapsed: (state, action: PayloadAction<boolean>) => {
      state.sidebarCollapsed = action.payload;
    },

    // Theme actions
    setTheme: (state, action: PayloadAction<Theme>) => {
      state.theme = action.payload;
    },

    toggleTheme: (state) => {
      state.theme = state.theme === "light" ? "dark" : "light";
    },

    // Error boundary actions
    setError: (state, action: PayloadAction<unknown>) => {
      state.hasError = true;
      state.errorInfo = action.payload;
    },

    clearError: (state) => {
      state.hasError = false;
      state.errorInfo = null;
    },

    // Breadcrumb actions
    setBreadcrumbs: (state, action: PayloadAction<Breadcrumb[]>) => {
      state.breadcrumbs = action.payload;
    },

    addBreadcrumb: (state, action: PayloadAction<Breadcrumb>) => {
      state.breadcrumbs.push(action.payload);
    },

    removeBreadcrumb: (state, action: PayloadAction<number>) => {
      state.breadcrumbs = state.breadcrumbs.filter(
        (_, index) => index !== action.payload,
      );
    },

    clearBreadcrumbs: (state) => {
      state.breadcrumbs = [];
    },

    // Page title
    setPageTitle: (state, action: PayloadAction<string>) => {
      state.pageTitle = action.payload;
    },
  },
});

// Selectors
export const selectNotifications = (state: { ui: UIState }) =>
  state.ui.notifications;
export const selectModals = (state: { ui: UIState }) => state.ui.modals;
export const selectGlobalLoading = (state: { ui: UIState }) =>
  state.ui.globalLoading;
export const selectPageLoading = (state: { ui: UIState }) =>
  state.ui.pageLoading;
export const selectSidebarOpen = (state: { ui: UIState }) =>
  state.ui.sidebarOpen;
export const selectSidebarCollapsed = (state: { ui: UIState }) =>
  state.ui.sidebarCollapsed;
export const selectTheme = (state: { ui: UIState }) => state.ui.theme;
export const selectHasError = (state: { ui: UIState }) => state.ui.hasError;
export const selectErrorInfo = (state: { ui: UIState }) => state.ui.errorInfo;
export const selectBreadcrumbs = (state: { ui: UIState }) =>
  state.ui.breadcrumbs;
export const selectPageTitle = (state: { ui: UIState }) => state.ui.pageTitle;

// Export actions
export const {
  showNotification,
  hideNotification,
  clearNotifications,
  openModal,
  closeModal,
  setGlobalLoading,
  setPageLoading,
  toggleSidebar,
  setSidebarOpen,
  toggleSidebarCollapsed,
  setSidebarCollapsed,
  setTheme,
  toggleTheme,
  setError,
  clearError,
  setBreadcrumbs,
  addBreadcrumb,
  removeBreadcrumb,
  clearBreadcrumbs,
  setPageTitle,
} = uiSlice.actions;

export type { Breadcrumb, ModalState, Notification, Theme, UIState };
export default uiSlice.reducer;
