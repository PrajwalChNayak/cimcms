import type { Notification } from "@api/mockData";
import { mockNotifications } from "@api/mockData";
import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";

interface NotificationsState {
  items: Notification[];
  isOpen: boolean;
}

const initialState: NotificationsState = {
  items: mockNotifications,
  isOpen: false,
};

const notificationsSlice = createSlice({
  name: "notifications",
  initialState,
  reducers: {
    markAsRead(state, action: PayloadAction<string>) {
      const n = state.items.find((n) => n.id === action.payload);
      if (n) n.read = true;
    },
    markAllAsRead(state) {
      state.items.forEach((n) => (n.read = true));
    },
    toggleNotificationsPanel(state) {
      state.isOpen = !state.isOpen;
    },
    closeNotificationsPanel(state) {
      state.isOpen = false;
    },
  },
});

export const {
  markAsRead,
  markAllAsRead,
  toggleNotificationsPanel,
  closeNotificationsPanel,
} = notificationsSlice.actions;

export const selectNotifications = (state: {
  notifications: NotificationsState;
}) => state.notifications.items;
export const selectUnreadCount = (state: {
  notifications: NotificationsState;
}) => state.notifications.items.filter((n) => !n.read).length;
export const selectNotificationsPanelOpen = (state: {
  notifications: NotificationsState;
}) => state.notifications.isOpen;

export default notificationsSlice.reducer;
