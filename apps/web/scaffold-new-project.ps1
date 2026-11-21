##############################################################
#  scaffold-new-project.ps1
#  Scaffolds a new React + Vite + RTK Query + Redux Persist
#  MVVM project matching the cultivo_iot_dashboard architecture.
#
#  Usage:
#    .\scaffold-new-project.ps1 -ProjectName "my-dashboard"
#    .\scaffold-new-project.ps1 -ProjectName "my-dashboard" -OutputPath "D:\projects"
##############################################################

param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectName,

    [Parameter(Mandatory = $false)]
    [string]$OutputPath = (Get-Location).Path
)

$root = Join-Path $OutputPath $ProjectName

function New-Dir($path) {
    if (-not (Test-Path $path)) {
        New-Item -ItemType Directory -Path $path -Force | Out-Null
    }
}

function New-File($path, $content) {
    New-Dir (Split-Path $path)
    Set-Content -Path $path -Value $content -Encoding UTF8
}

Write-Host ""
Write-Host "Scaffolding project: $ProjectName" -ForegroundColor Cyan
Write-Host "Location           : $root" -ForegroundColor Cyan
Write-Host ""

# ── Root files ────────────────────────────────────────────────────────────────

New-File "$root\index.html" @"
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>$ProjectName</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
"@

New-File "$root\package.json" @"
{
  "name": "$($ProjectName.ToLower().Replace(' ', '-'))",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  },
  "dependencies": {
    "@reduxjs/toolkit": "^2.6.1",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "react-hook-form": "^7.74.0",
    "react-redux": "^9.2.0",
    "react-router-dom": "^7.6.1",
    "redux-persist": "^6.0.0"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.4",
    "@tailwindcss/vite": "^4.1.7",
    "@types/node": "^24.12.0",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.1",
    "typescript": "^5.8.3",
    "vite": "^6.3.5"
  }
}
"@

New-File "$root\vite.config.ts" @"
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@api": path.resolve(__dirname, "./src/api"),
      "@store": path.resolve(__dirname, "./src/store"),
      "@shared": path.resolve(__dirname, "./src/shared"),
      "@config": path.resolve(__dirname, "./src/config"),
      "@appTypes": path.resolve(__dirname, "./src/types"),
      "@repository": path.resolve(__dirname, "./src/repository"),
      "@viewModels": path.resolve(__dirname, "./src/viewmodels"),
      "@view": path.resolve(__dirname, "./src/view"),
    },
  },
});
"@

New-File "$root\tsconfig.json" @"
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
"@

New-File "$root\tsconfig.app.json" @"
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@api/*": ["./src/api/*"],
      "@store/*": ["./src/store/*"],
      "@shared/*": ["./src/shared/*"],
      "@config/*": ["./src/config/*"],
      "@appTypes/*": ["./src/types/*"],
      "@repository/*": ["./src/repository/*"],
      "@viewModels/*": ["./src/viewmodels/*"],
      "@view/*": ["./src/view/*"]
    }
  },
  "include": ["src"]
}
"@

New-File "$root\tsconfig.node.json" @"
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
  },
  "include": ["vite.config.ts"]
}
"@

New-File "$root\.env" @"
VITE_API_BASE_URL=http://localhost:3000/api/v1
"@

New-File "$root\.gitignore" @"
node_modules
dist
.env.local
.env.production
"@

New-File "$root\README.md" @"
# $ProjectName

React + Vite + TypeScript + Redux Toolkit + RTK Query + React Router v7

## Architecture
- **MVVM** — view / viewmodels / repository separation
- **RTK Query** — data fetching via \`baseApi\`
- **Redux Persist** — auth state persisted to localStorage
- **Tailwind CSS v4** — utility-first styling

## Getting Started
\`\`\`
npm install
npm run dev
\`\`\`
"@

# ── src/index.css ─────────────────────────────────────────────────────────────
New-File "$root\src\index.css" @"
@import "tailwindcss";
"@

# ── src/main.tsx ──────────────────────────────────────────────────────────────
New-File "$root\src\main.tsx" @"
import App from '@/App.tsx';
import { store, persistor } from '@store/store';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <App />
      </PersistGate>
    </Provider>
  </StrictMode>,
);
"@

# ── src/App.tsx ───────────────────────────────────────────────────────────────
New-File "$root\src\App.tsx" @"
import { AppRouter } from '@shared/router';
import React from 'react';

const App: React.FC = () => {
  return <AppRouter />;
};

export default App;
"@

# ── config ────────────────────────────────────────────────────────────────────
New-File "$root\src\config\env.ts" @"
interface EnvConfig {
  API_BASE_URL: string;
  API_TIMEOUT: number;
  ENABLE_LOGGING: boolean;
}

const DEV_CONFIG: EnvConfig = {
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1',
  API_TIMEOUT: 30000,
  ENABLE_LOGGING: true,
};

const PROD_CONFIG: EnvConfig = {
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL ?? 'https://api.example.com/v1',
  API_TIMEOUT: 15000,
  ENABLE_LOGGING: false,
};

export const ENV: EnvConfig = import.meta.env.DEV ? DEV_CONFIG : PROD_CONFIG;
"@

# ── types ─────────────────────────────────────────────────────────────────────
New-File "$root\src\types\index.ts" @"
export * from '@appTypes/api.types';
export * from '@appTypes/auth.types';
"@

New-File "$root\src\types\api.types.ts" @"
export interface ApiError {
  status: number;
  message: string;
  errors?: Record<string, string[]>;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
"@

New-File "$root\src\types\auth.types.ts" @"
export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}
"@

# ── api ───────────────────────────────────────────────────────────────────────
New-File "$root\src\api\baseApi.ts" @"
import { ENV } from '@config/env';
import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import type { RootState } from '@store/store';

const baseQuery = fetchBaseQuery({
  baseUrl: ENV.API_BASE_URL,
  timeout: ENV.API_TIMEOUT,
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth?.token;
    if (token) headers.set('authorization', `Bearer `+"`"+`${token}`+"`"+`);
    return headers;
  },
});

const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  const result = await baseQuery(args, api, extraOptions);
  if (result.error?.status === 401) {
    const { logout } = await import('@store/slices/authSlice');
    api.dispatch(logout());
  }
  return result;
};

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Auth'] as const,
  endpoints: () => ({}),
  keepUnusedDataFor: 60,
  refetchOnMountOrArgChange: 30,
  refetchOnFocus: true,
  refetchOnReconnect: true,
});
"@

New-File "$root\src\api\authApi.ts" @"
import type { LoginRequest, LoginResponse, User } from '@appTypes/auth.types';
import { baseApi } from '@api/baseApi';

export const authApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation<LoginResponse, LoginRequest>({
      query: (credentials) => ({
        url: '/auth/login',
        method: 'POST',
        body: credentials,
      }),
      invalidatesTags: ['Auth'],
    }),
    me: builder.query<User, void>({
      query: () => '/auth/me',
      providesTags: ['Auth'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useLoginMutation,
  useMeQuery,
  useLazyMeQuery,
} = authApi;
"@

New-File "$root\src\api\index.ts" @"
export { baseApi } from '@api/baseApi';
export {
  authApi,
  useLoginMutation,
  useMeQuery,
  useLazyMeQuery,
} from '@api/authApi';
"@

# ── store/slices ───────────────────────────────────────────────────────────────
New-File "$root\src\store\slices\authSlice.ts" @"
import { authApi } from '@api/authApi';
import type { User } from '@appTypes/auth.types';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';

interface AuthState {
  token: string | null;
  userId: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  isInitialized?: boolean;
  loginTime?: number | null;
}

const initialState: AuthState = {
  token: null,
  userId: null,
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials: (
      state,
      action: PayloadAction<{ token: string; userId?: string; loginTime?: number } | null | undefined>,
    ) => {
      const token = action.payload?.token ?? null;
      state.token = token;
      state.userId = action.payload?.userId ?? state.userId;
      state.loginTime = action.payload?.loginTime ?? state.loginTime;
      state.isAuthenticated = !!token;
      state.isLoading = false;
      state.error = null;
    },
    setUser: (state, action: PayloadAction<User | null>) => {
      state.user = action.payload;
      if (action.payload) state.userId = action.payload.id;
    },
    setAuthError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
      state.isLoading = false;
    },
    clearError: (state) => { state.error = null; },
    logout: () => ({ ...initialState }),
  },
  extraReducers: (builder) => {
    builder
      .addMatcher(authApi.endpoints.login.matchPending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addMatcher(authApi.endpoints.login.matchFulfilled, (state, { payload }) => {
        state.token = payload.token;
        state.user = payload.user;
        state.userId = payload.user.id;
        state.isAuthenticated = true;
        state.isLoading = false;
        state.loginTime = Date.now();
      })
      .addMatcher(authApi.endpoints.login.matchRejected, (state, { error }) => {
        state.isLoading = false;
        state.error = error.message ?? 'Login failed';
      });
  },
});

export const { setCredentials, setUser, setAuthError, clearError, logout } = authSlice.actions;

// Selectors
export const selectAuthToken        = (s: { auth: AuthState }) => s.auth.token;
export const selectAuthUser         = (s: { auth: AuthState }) => s.auth.user;
export const selectAuthUserId       = (s: { auth: AuthState }) => s.auth.userId;
export const selectAuthRole         = (s: { auth: AuthState }) => s.auth.user?.role;
export const selectIsAuthenticated  = (s: { auth: AuthState }) => s.auth.isAuthenticated;
export const selectIsLoading        = (s: { auth: AuthState }) => s.auth.isLoading;
export const selectAuthError        = (s: { auth: AuthState }) => s.auth.error;

export default authSlice.reducer;
"@

New-File "$root\src\store\slices\toastSlice.ts" @"
import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
}

const initialState: ToastState = { toasts: [] };

const toastSlice = createSlice({
  name: 'toast',
  initialState,
  reducers: {
    addToast: (state, action: PayloadAction<Omit<Toast, 'id'>>) => {
      state.toasts.push({ ...action.payload, id: Date.now().toString() });
    },
    removeToast: (state, action: PayloadAction<string>) => {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
    removeAllToasts: (state) => { state.toasts = []; },
  },
});

export const { addToast, removeToast, removeAllToasts } = toastSlice.actions;
export const selectToasts = (s: { toast: ToastState }) => s.toast.toasts;
export default toastSlice.reducer;
"@

New-File "$root\src\store\slices\uiSlice.ts" @"
import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';

interface UIState {
  sidebarOpen: boolean;
  theme: 'light' | 'dark';
}

const initialState: UIState = { sidebarOpen: true, theme: 'light' };

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleSidebar: (state) => { state.sidebarOpen = !state.sidebarOpen; },
    setSidebarOpen: (state, action: PayloadAction<boolean>) => { state.sidebarOpen = action.payload; },
    setTheme: (state, action: PayloadAction<'light' | 'dark'>) => { state.theme = action.payload; },
  },
});

export const { toggleSidebar, setSidebarOpen, setTheme } = uiSlice.actions;
export const selectSidebarOpen = (s: { ui: UIState }) => s.ui.sidebarOpen;
export const selectTheme       = (s: { ui: UIState }) => s.ui.theme;
export default uiSlice.reducer;
"@

New-File "$root\src\store\slices\index.ts" @"
export * from '@store/slices/authSlice';
export * from '@store/slices/toastSlice';
export * from '@store/slices/uiSlice';
"@

# ── store/middleware ───────────────────────────────────────────────────────────
New-File "$root\src\store\middleware\index.ts" @"
import type { Middleware } from '@reduxjs/toolkit';
import { isRejectedWithValue } from '@reduxjs/toolkit';
import { addToast } from '@store/slices/toastSlice';

export const errorMiddleware: Middleware = (store) => (next) => (action) => {
  if (isRejectedWithValue(action)) {
    const payload = action.payload as { data?: { message?: string }; status?: number };
    const message = payload?.data?.message ?? 'An unexpected error occurred.';
    store.dispatch(addToast({ type: 'error', message }));
  }
  return next(action);
};
"@

# ── store ─────────────────────────────────────────────────────────────────────
New-File "$root\src\store\rootReducer.ts" @"
import { baseApi } from '@api/baseApi';
import { combineReducers } from '@reduxjs/toolkit';
import authSlice from '@store/slices/authSlice';
import toastSlice from '@store/slices/toastSlice';
import uiSlice from '@store/slices/uiSlice';

const rootReducer = combineReducers({
  [baseApi.reducerPath]: baseApi.reducer,
  auth: authSlice,
  ui: uiSlice,
  toast: toastSlice,
});

export type RootState = ReturnType<typeof rootReducer>;
export default rootReducer;
"@

New-File "$root\src\store\store.ts" @"
import { baseApi } from '@api/baseApi';
import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { errorMiddleware } from '@store/middleware/index';
import rootReducer from '@store/rootReducer';
import { persistReducer, persistStore, FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER } from 'redux-persist';
import storage from 'redux-persist/lib/storage';

const persistConfig = {
  key: 'root',
  storage,
  whitelist: ['auth'],
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: { ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER] },
    })
      .concat(baseApi.middleware)
      .concat(errorMiddleware),
});

setupListeners(store.dispatch);

export const persistor = persistStore(store);
export type AppDispatch = typeof store.dispatch;
export type RootState = ReturnType<typeof store.getState>;
"@

New-File "$root\src\store\hooks.ts" @"
import type { AppDispatch, RootState } from '@store/store';
import { useDispatch, useSelector } from 'react-redux';

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
"@

New-File "$root\src\store\index.ts" @"
export { useAppDispatch, useAppSelector } from '@store/hooks';
export * from '@store/slices';
export { store, persistor } from '@store/store';
export type { AppDispatch, RootState } from '@store/store';
"@

# ── repository ────────────────────────────────────────────────────────────────
New-File "$root\src\repository\authRepository.ts" @"
import { useLoginMutation, useMeQuery } from '@api/authApi';

export const useAuthRepository = () => {
  const [login, loginState] = useLoginMutation();
  const meQuery = useMeQuery();

  return { login, loginState, meQuery };
};
"@

New-File "$root\src\repository\index.ts" @"
export { useAuthRepository } from '@repository/authRepository';
"@

# ── viewmodels ────────────────────────────────────────────────────────────────
New-File "$root\src\viewmodels\useLoginViewModel.ts" @"
import { useAuthRepository } from '@repository/authRepository';
import { setCredentials, setUser } from '@store/slices/authSlice';
import { useAppDispatch } from '@store/hooks';
import { useNavigate } from 'react-router-dom';

export const useLoginViewModel = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { login, loginState } = useAuthRepository();

  const handleLogin = async (email: string, password: string) => {
    try {
      const result = await login({ email, password }).unwrap();
      dispatch(setCredentials({ token: result.token, userId: result.user.id, loginTime: Date.now() }));
      dispatch(setUser(result.user));
      navigate('/dashboard');
    } catch {
      // error handled by errorMiddleware toast
    }
  };

  return {
    handleLogin,
    isLoading: loginState.isLoading,
    error: loginState.error,
  };
};
"@

New-File "$root\src\viewmodels\index.ts" @"
export { useLoginViewModel } from '@viewModels/useLoginViewModel';
"@

# ── shared/utils ──────────────────────────────────────────────────────────────
New-File "$root\src\shared\utils\logger.ts" @"
import { ENV } from '@config/env';

export const logger = {
  log:   (...args: unknown[]) => { if (ENV.ENABLE_LOGGING) console.log(...args); },
  warn:  (...args: unknown[]) => { if (ENV.ENABLE_LOGGING) console.warn(...args); },
  error: (...args: unknown[]) => console.error(...args),
};
"@

New-File "$root\src\shared\utils\errorUtils.ts" @"
export function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  const e = error as { data?: { message?: string }; message?: string };
  return e?.data?.message ?? e?.message ?? 'Unknown error';
}
"@

New-File "$root\src\shared\utils\ErrorBoundary.tsx" @"
import React from 'react';

interface State { hasError: boolean; message: string }

class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center">
          <p className="text-red-500">Something went wrong: {this.state.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
"@

New-File "$root\src\shared\utils\ColorConstant.ts" @"
export const Colors = {
  primary:   '#3B82F6',
  secondary: '#6B7280',
  success:   '#10B981',
  warning:   '#F59E0B',
  error:     '#EF4444',
  info:      '#06B6D4',
} as const;
"@

# ── shared/components/loading ──────────────────────────────────────────────────
New-File "$root\src\shared\components\loading\LoadingSpinner.tsx" @"
export const LoadingSpinner: React.FC = () => (
  <div className="flex h-full w-full items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
  </div>
);
"@

New-File "$root\src\shared\components\loading\FullScreenLoading.tsx" @"
import { LoadingSpinner } from './LoadingSpinner';

export const FullScreenLoading: React.FC = () => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80">
    <LoadingSpinner />
  </div>
);
"@

New-File "$root\src\shared\components\loading\SkeletonLoader.tsx" @"
export const SkeletonLoader: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse rounded bg-gray-200 `+"`"+`${className}`+"`"+`} />
);
"@

New-File "$root\src\shared\components\loading\CardSkeleton.tsx" @"
import { SkeletonLoader } from './SkeletonLoader';

export const CardSkeleton: React.FC = () => (
  <div className="rounded-lg border p-4 shadow-sm">
    <SkeletonLoader className="mb-2 h-4 w-3/4" />
    <SkeletonLoader className="h-4 w-1/2" />
  </div>
);
"@

New-File "$root\src\shared\components\loading\index.ts" @"
export { CardSkeleton }      from './CardSkeleton';
export { FullScreenLoading } from './FullScreenLoading';
export { LoadingSpinner }    from './LoadingSpinner';
export { SkeletonLoader }    from './SkeletonLoader';
"@

# ── shared/components/splash ──────────────────────────────────────────────────
New-File "$root\src\shared\components\splash\SplashScreen.tsx" @"
import React, { useEffect } from 'react';

interface Props { onFinished: () => void; duration?: number }

export const SplashScreen: React.FC<Props> = ({ onFinished, duration = 1500 }) => {
  useEffect(() => {
    const t = setTimeout(onFinished, duration);
    return () => clearTimeout(t);
  }, [onFinished, duration]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-white">
      <h1 className="text-3xl font-bold text-blue-600">Loading...</h1>
    </div>
  );
};
"@

New-File "$root\src\shared\components\splash\index.ts" @"
export { SplashScreen } from './SplashScreen';
"@

# ── shared/components/ui ──────────────────────────────────────────────────────
New-File "$root\src\shared\components\ui\Button.tsx" @"
import React from 'react';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  isLoading?: boolean;
}

export const Button: React.FC<Props> = ({ variant = 'primary', isLoading, children, className = '', ...rest }) => {
  const base = 'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition focus:outline-none disabled:opacity-50';
  const variants = {
    primary:   'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-gray-100 text-gray-800 hover:bg-gray-200',
    danger:    'bg-red-600 text-white hover:bg-red-700',
  };
  return (
    <button className={`+"`"+`${base} ${variants[variant]} ${className}`+"`"+`} disabled={isLoading} {...rest}>
      {isLoading ? <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : null}
      {children}
    </button>
  );
};
"@

New-File "$root\src\shared\components\ui\Input.tsx" @"
import React from 'react';

interface Props extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<Props> = ({ label, error, className = '', ...rest }) => (
  <div className="flex flex-col gap-1">
    {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
    <input
      className={`+"`"+`rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${error ? 'border-red-500' : 'border-gray-300'} ${className}`+"`"+`}
      {...rest}
    />
    {error && <p className="text-xs text-red-500">{error}</p>}
  </div>
);
"@

New-File "$root\src\shared\components\ui\DataTable.tsx" @"
import React from 'react';

export interface Column<T> { key: keyof T; header: string; render?: (value: T[keyof T], row: T) => React.ReactNode }

interface Props<T> { data: T[]; columns: Column<T>[]; isLoading?: boolean }

export function DataTable<T extends { id: string | number }>({ data, columns, isLoading }: Props<T>) {
  if (isLoading) return <div className="p-4 text-center text-gray-500">Loading...</div>;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>{columns.map((c) => <th key={String(c.key)} className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{c.header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {data.map((row) => (
            <tr key={row.id} className="hover:bg-gray-50">
              {columns.map((c) => <td key={String(c.key)} className="px-4 py-3 text-sm text-gray-700">{c.render ? c.render(row[c.key], row) : String(row[c.key] ?? '')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
"@

New-File "$root\src\shared\components\ui\index.ts" @"
export { Button }    from './Button';
export { DataTable } from './DataTable';
export type { Column } from './DataTable';
export { Input }     from './Input';
"@

# ── shared/layouts ────────────────────────────────────────────────────────────
New-File "$root\src\shared\layouts\AuthLayout.tsx" @"
import React from 'react';
import { Outlet } from 'react-router-dom';

export const AuthLayout: React.FC = () => (
  <div className="flex min-h-screen items-center justify-center bg-gray-50">
    <Outlet />
  </div>
);
"@

New-File "$root\src\shared\layouts\PublicLayout.tsx" @"
import React from 'react';
import { Outlet } from 'react-router-dom';

export const PublicLayout: React.FC = () => (
  <div className="min-h-screen bg-white">
    <Outlet />
  </div>
);
"@

New-File "$root\src\shared\layouts\DashboardLayout.tsx" @"
import React from 'react';
import { Outlet } from 'react-router-dom';

export const DashboardLayout: React.FC = () => (
  <div className="flex min-h-screen bg-gray-100">
    <aside className="w-64 bg-white shadow-md">
      {/* Sidebar placeholder */}
    </aside>
    <main className="flex-1 p-6">
      <Outlet />
    </main>
  </div>
);
"@

New-File "$root\src\shared\layouts\index.ts" @"
export { AuthLayout }      from './AuthLayout';
export { DashboardLayout } from './DashboardLayout';
export { PublicLayout }    from './PublicLayout';
"@

# ── shared/router ─────────────────────────────────────────────────────────────
New-File "$root\src\shared\router\routes.ts" @"
export interface RouteConfig {
  path: string;
  element: string;
  layout: string;
  roles?: string[];
}

export const publicRoutes: RouteConfig[] = [
  { path: '/login', element: 'Login', layout: 'AuthLayout' },
];

export const protectedRoutes: RouteConfig[] = [
  { path: '/dashboard', element: 'Dashboard', layout: 'DashboardLayout', roles: [] },
];

export const errorRoutes: RouteConfig[] = [
  { path: '/404', element: 'NotFoundScreen', layout: 'PublicLayout' },
  { path: '/403', element: 'ForbiddenScreen', layout: 'PublicLayout' },
  { path: '/500', element: 'ServerErrorScreen', layout: 'PublicLayout' },
];

export const redirects = {
  '/': '/dashboard',
  default: '/404',
  afterLogin: '/dashboard',
  afterLogout: '/login',
} as const;
"@

New-File "$root\src\shared\router\ProtectedRoute.tsx" @"
import { selectIsAuthenticated } from '@store/slices/authSlice';
import { useAppSelector } from '@store/hooks';
import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';

export const ProtectedRoute: React.FC = () => {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};
"@

New-File "$root\src\shared\router\PublicRoute.tsx" @"
import { selectIsAuthenticated } from '@store/slices/authSlice';
import { useAppSelector } from '@store/hooks';
import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';

export const PublicRoute: React.FC = () => {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <Outlet />;
};
"@

New-File "$root\src\shared\router\RoleGuard.tsx" @"
import { selectAuthRole } from '@store/slices/authSlice';
import { useAppSelector } from '@store/hooks';
import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';

interface Props { allowedRoles: string[] }

export const RoleGuard: React.FC<Props> = ({ allowedRoles }) => {
  const role = useAppSelector(selectAuthRole);
  if (!role || (allowedRoles.length > 0 && !allowedRoles.includes(role))) {
    return <Navigate to="/403" replace />;
  }
  return <Outlet />;
};
"@

New-File "$root\src\shared\router\AppRouter.tsx" @"
import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthLayout }      from '@shared/layouts/AuthLayout';
import { DashboardLayout } from '@shared/layouts/DashboardLayout';
import { PublicLayout }    from '@shared/layouts/PublicLayout';
import { ProtectedRoute }  from '@shared/router/ProtectedRoute';
import { PublicRoute }     from '@shared/router/PublicRoute';
import ErrorBoundary       from '@shared/utils/ErrorBoundary';
import { LoadingSpinner }  from '@shared/components/loading';

const Dashboard       = lazy(() => import('@view/home/dashboard/Dashboard'));
const LoginPage       = lazy(() => import('@view/auth/LoginPage'));
const NotFoundScreen  = lazy(() => import('@view/errors/NotFoundScreen'));
const ForbiddenScreen = lazy(() => import('@view/errors/ForbiddenScreen'));
const ServerErrorScreen = lazy(() => import('@view/errors/ServerErrorScreen'));

export const AppRouter: React.FC = () => (
  <BrowserRouter>
    <ErrorBoundary>
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          {/* Public */}
          <Route element={<PublicRoute />}>
            <Route element={<AuthLayout />}>
              <Route path="/login" element={<LoginPage />} />
            </Route>
          </Route>

          {/* Protected */}
          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
            </Route>
          </Route>

          {/* Errors */}
          <Route element={<PublicLayout />}>
            <Route path="/404" element={<NotFoundScreen />} />
            <Route path="/403" element={<ForbiddenScreen />} />
            <Route path="/500" element={<ServerErrorScreen />} />
          </Route>

          {/* Redirects */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  </BrowserRouter>
);
"@

New-File "$root\src\shared\router\index.ts" @"
export { AppRouter }      from './AppRouter';
export { ProtectedRoute } from './ProtectedRoute';
export { PublicRoute }    from './PublicRoute';
export { RoleGuard }      from './RoleGuard';
"@

# ── views ─────────────────────────────────────────────────────────────────────
New-File "$root\src\view\auth\LoginPage.tsx" @"
import { Button } from '@shared/components/ui';
import { Input }  from '@shared/components/ui';
import { useLoginViewModel } from '@viewModels/useLoginViewModel';
import React from 'react';
import { useForm } from 'react-hook-form';

interface FormValues { email: string; password: string }

const LoginPage: React.FC = () => {
  const { handleLogin, isLoading } = useLoginViewModel();
  const { register, handleSubmit } = useForm<FormValues>();

  const onSubmit = (data: FormValues) => handleLogin(data.email, data.password);

  return (
    <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-md">
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Sign in</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <Input label="Email" type="email" {...register('email', { required: true })} />
        <Input label="Password" type="password" {...register('password', { required: true })} />
        <Button type="submit" isLoading={isLoading}>Sign in</Button>
      </form>
    </div>
  );
};

export default LoginPage;
"@

New-File "$root\src\view\home\dashboard\Dashboard.tsx" @"
import React from 'react';

const Dashboard: React.FC = () => (
  <div>
    <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
    <p className="mt-2 text-gray-500">Welcome to your dashboard.</p>
  </div>
);

export default Dashboard;
"@

New-File "$root\src\view\errors\NotFoundScreen.tsx" @"
import React from 'react';
import { Link } from 'react-router-dom';

const NotFoundScreen: React.FC = () => (
  <div className="flex h-screen flex-col items-center justify-center gap-4">
    <h1 className="text-6xl font-bold text-gray-300">404</h1>
    <p className="text-gray-600">Page not found</p>
    <Link to="/dashboard" className="text-blue-500 underline">Go to Dashboard</Link>
  </div>
);

export default NotFoundScreen;
"@

New-File "$root\src\view\errors\ForbiddenScreen.tsx" @"
import React from 'react';
import { Link } from 'react-router-dom';

const ForbiddenScreen: React.FC = () => (
  <div className="flex h-screen flex-col items-center justify-center gap-4">
    <h1 className="text-6xl font-bold text-gray-300">403</h1>
    <p className="text-gray-600">You are not authorised to view this page.</p>
    <Link to="/dashboard" className="text-blue-500 underline">Go to Dashboard</Link>
  </div>
);

export default ForbiddenScreen;
"@

New-File "$root\src\view\errors\ServerErrorScreen.tsx" @"
import React from 'react';
import { Link } from 'react-router-dom';

const ServerErrorScreen: React.FC = () => (
  <div className="flex h-screen flex-col items-center justify-center gap-4">
    <h1 className="text-6xl font-bold text-gray-300">500</h1>
    <p className="text-gray-600">Something went wrong on our end.</p>
    <Link to="/dashboard" className="text-blue-500 underline">Go to Dashboard</Link>
  </div>
);

export default ServerErrorScreen;
"@

New-File "$root\src\view\errors\ErrorScreenLayout.tsx" @"
import React from 'react';
import { Outlet } from 'react-router-dom';

export const ErrorScreenLayout: React.FC = () => (
  <div className="min-h-screen bg-gray-50">
    <Outlet />
  </div>
);
"@

# ── models (placeholder) ──────────────────────────────────────────────────────
New-Dir "$root\src\models"

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Done! Project scaffold created at: $root" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  cd $root"
Write-Host "  npm install"
Write-Host "  npm run dev"
Write-Host ""
