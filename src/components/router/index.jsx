import { useSelector } from "react-redux";
import { Route, Routes } from "react-router-dom";

import AdminLayout from "../layout/admin";
import { authRoutes, nonAuthRoutes } from "./router";

const Router = () => {
  const { auth } = useSelector((state) => state.auth);

  if (!auth) {
    return (
      <Routes>
        <Route path="/" >
          {nonAuthRoutes.map((route, index) => {
            return (
              <Route
                key={index}
                path={route.path}
                element={route.element}
                index={route?.index}
              />
            );
          })}
        </Route>
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<AdminLayout />}>
        {authRoutes.map((route, index) => {
          return (
            <Route
              key={index}
              path={route.path}
              element={route.element}
              index={route?.index}
            />
          );
        })}
      </Route>
    </Routes>
  );
};

export default Router;
