import { baseApi } from "@api/baseApi.ts";
import { configureStore } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import {
  authMiddleware,
  errorMiddleware,
  performanceMiddleware,
} from "@store/middleware/index.ts";
import type { RootState } from "@store/rootReducer.ts";
import rootReducer from "@store/rootReducer.ts";
import {
  FLUSH,
  PAUSE,
  PERSIST,
  persistReducer,
  persistStore,
  PURGE,
  REGISTER,
  REHYDRATE,
} from "redux-persist";
import storageLib from "redux-persist/lib/storage";

// redux-persist/lib/storage ships as CJS; unwrap the default export for ESM/Vite
const storage =
  (storageLib as unknown as { default: typeof storageLib }).default ??
  storageLib;

// Redux Persist configuration
const persistConfig = {
  key: "CultivoIot-root",
  storage,
  version: 1,
  whitelist: ["auth"],
  blacklist: [baseApi.reducerPath],
  transforms: [
    {
      in: (inboundState: unknown, key: string) => {
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
      out: (outboundState: unknown, key: string) => {
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
    },
  ],
  migrate: (state: unknown) => Promise.resolve(state),
};

// Create persisted reducer
const persistedReducer = persistReducer(persistConfig, rootReducer);

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
      baseApi.middleware,
      errorMiddleware,
      authMiddleware,
      ...(process.env.NODE_ENV === "development"
        ? [performanceMiddleware]
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
