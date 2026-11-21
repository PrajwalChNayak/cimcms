import { baseApi } from "@api/baseApi.ts";
import type { Middleware, Reducer } from "@reduxjs/toolkit";
import { configureStore } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import {
  authMiddleware,
  errorMiddleware,
  performanceMiddleware,
} from "@store/middleware/index.ts";
import type { RootState } from "@store/rootReducer.ts";
import rootReducer from "@store/rootReducer.ts";
import type { PersistedState } from "redux-persist";
import {
  FLUSH,
  PAUSE,
  PERSIST,
  persistReducer,
  persistStore,
  PURGE,
  REGISTER,
  REHYDRATE,
  type Transform,
} from "redux-persist";
import storageLib from "redux-persist/lib/storage";

// redux-persist/lib/storage ships as CJS; unwrap the default export for ESM/Vite
const storage =
  (storageLib as unknown as { default: typeof storageLib }).default ??
  storageLib;

const authTransform: Transform<any, any> = {
  in: (inboundState: unknown, key: string | number | symbol) => {
    if (key === "auth") {
      const {
        error: _error,
        isLoading: _isLoading,
        ...persistedState
      } = inboundState as {
        error?: unknown;
        isLoading?: unknown;
        [k: string]: unknown;
      };
      return persistedState;
    }
    return inboundState;
  },
  out: (outboundState: unknown, key: string | number | symbol) => {
    if (key === "auth") {
      return {
        ...(outboundState as object),
        isLoading: false,
        error: null,
        isInitialized: false,
      };
    }
    return outboundState;
  },
};

// Redux Persist configuration
const persistConfig = {
  key: "CultivoIot-root",
  storage,
  version: 1,
  whitelist: ["auth"],
  blacklist: [baseApi.reducerPath],
  transforms: [authTransform],
  migrate: (state: PersistedState) => Promise.resolve(state),
};

// Create persisted reducer
const persistedReducer = persistReducer<Partial<RootState>>(
  persistConfig,
  rootReducer as Reducer<Partial<RootState>>,
);

// Configure the Redux store with persistence
export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [
          FLUSH,
          REHYDRATE,
          PAUSE,
          PERSIST,
          PURGE,
          REGISTER,
          "persist/PERSIST",
          "persist/REHYDRATE",
        ],
        ignoredActionsPaths: ["meta.arg", "payload.timestamp"],
        ignoredPaths: ["items.dates"],
      },
    }).concat([
      baseApi.middleware as Middleware,
      errorMiddleware as Middleware,
      authMiddleware as Middleware,
      ...(process.env.NODE_ENV === "development"
        ? [performanceMiddleware as Middleware]
        : []),
    ]),

  devTools: process.env.NODE_ENV === "development",
});

// Create persistor for Redux Persist
export const persistor = persistStore(store);

// Enable listener behavior for the store
setupListeners(store.dispatch);

export type { RootState };
export type AppDispatch = typeof store.dispatch;

export default store;
