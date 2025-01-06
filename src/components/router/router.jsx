
import AdminHome from "../../page/admin";
import Login from "../../page/auth/login";

export const nonAuthRoutes = [

  {
    path: "*",
    element: <Login />,
  },
  {
    path: "/",
    element: <Login />,
    index: true,
  },

];

export const authRoutes = [
  {
    path: "/dashboard",
    element: <AdminHome />,
    index: true,
  },

];

