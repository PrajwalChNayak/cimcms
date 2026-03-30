import { baseApi } from "@api/baseApi.ts";
import { combineReducers } from "@reduxjs/toolkit";
import authSlice from "@store/slices/authSlice.ts";
import toastSlice from "@store/slices/toastSlice.ts";
import uiSlice from "@store/slices/uiSlice.ts";

const rootReducer = combineReducers({
  [baseApi.reducerPath]: baseApi.reducer,
  auth: authSlice,
  ui: uiSlice,
  toast: toastSlice,
});

export type RootState = ReturnType<typeof rootReducer>;
export default rootReducer;
