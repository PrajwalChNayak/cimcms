import { baseApi } from "@api/baseApi.ts";
import { combineReducers } from "@reduxjs/toolkit";
import authSlice from "@store/slices/authSlice.ts";
import devicesSlice from "@store/slices/devicesSlice.ts";
import farmsSlice from "@store/slices/farmsSlice.ts";
import notificationsSlice from "@store/slices/notificationsSlice.ts";
import toastSlice from "@store/slices/toastSlice.ts";
import uiSlice from "@store/slices/uiSlice.ts";

const rootReducer = combineReducers({
  [baseApi.reducerPath]: baseApi.reducer,
  auth: authSlice,
  ui: uiSlice,
  toast: toastSlice,
  farms: farmsSlice,
  devices: devicesSlice,
  notifications: notificationsSlice,
});

export type RootState = ReturnType<typeof rootReducer>;
export default rootReducer;
