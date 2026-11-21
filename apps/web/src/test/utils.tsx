import { baseApi } from "@api/baseApi";
import type { CurrentUserDto } from "@cimcms/contracts";
import { configureStore, type Middleware } from "@reduxjs/toolkit";
import rootReducer from "@store/rootReducer";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";

/** Real reducers + RTK Query middleware, no persistence (tests only). */
export const createTestStore = () =>
  configureStore({
    reducer: rootReducer,
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false }).concat(
        baseApi.middleware as Middleware,
      ),
  });

export type TestStore = ReturnType<typeof createTestStore>;

export const makeUser = (
  permissions: string[],
  overrides: Partial<CurrentUserDto> = {},
): CurrentUserDto => ({
  id: "u1",
  email: "tech@example.test",
  name: "Test User",
  roles: ["TECHNICIAN"],
  permissions,
  ...overrides,
});

export const renderWithProviders = (
  ui: ReactElement,
  { store = createTestStore(), route = "/" } = {},
) => ({
  store,
  ...render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </Provider>,
  ),
});
