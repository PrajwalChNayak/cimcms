export interface RouteConfig {
  path: string;
  element: string;
  layout: string;
  permissions?: string[];
  roles?: string[];
}

export interface RouteMetadata {
  title: string;
  description: string;
  breadcrumb: string;
}

export interface Redirects {
  "/": string;
  default: string;
  afterLogin: string;
  afterLogout: string;
}

export const publicRoutes: RouteConfig[] = [
  {
    path: "/login",
    element: "Login",
    layout: "AuthLayout",
  },
];

// Protected routes (require authentication)
export const protectedRoutes: RouteConfig[] = [
  // Dashboard
  // {
  //   path: "/dashboard",
  //   element: "Dashboard",
  //   layout: "DashboardLayout",
  //   permissions: [],
  //   roles: [],
  // },
];

// Error routes
export const errorRoutes: RouteConfig[] = [
  {
    path: "/404",
    element: "NotFoundScreen",
    layout: "PublicLayout",
  },
  {
    path: "/403",
    element: "ForbiddenScreen",
    layout: "PublicLayout",
  },
  {
    path: "/500",
    element: "ServerErrorScreen",
    layout: "PublicLayout",
  },
];

// Default redirects
export const redirects: Redirects = {
  "/": "/login",
  default: "/login",
  afterLogin: "/dashboard",
  afterLogout: "/login",
};

// Route metadata
export const routeMetadata: Record<string, RouteMetadata> = {
  "/dashboard": {
    title: "Dashboard",
    description: "Main dashboard overview",
    breadcrumb: "Dashboard",
  },
  "/login": {
    title: "Login",
    description: "User authentication",
    breadcrumb: "Login",
  },
};

/**
 * Get route configuration by path
 */
export const getRouteConfig = (path: string): RouteConfig | undefined => {
  const allRoutes = [...publicRoutes, ...protectedRoutes, ...errorRoutes];
  return allRoutes.find((route) => route.path === path);
};

/**
 * Check if route is protected
 */
export const isProtectedRoute = (path: string): boolean => {
  return protectedRoutes.some((route) => route.path === path);
};

/**
 * Check if route is public
 */
export const isPublicRoute = (path: string): boolean => {
  return publicRoutes.some((route) => route.path === path);
};

/**
 * Get route metadata
 */
export const getRouteMetadata = (path: string): RouteMetadata => {
  return (
    routeMetadata[path] ?? {
      title: "Healthcare",
      description: "Healthcare Management Module",
      breadcrumb: "Home",
    }
  );
};
