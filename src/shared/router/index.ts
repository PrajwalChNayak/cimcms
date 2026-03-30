// Shared Router Components
// Router infrastructure that can be reused across the application

export { AppRouter } from "@shared/router/AppRouter.tsx";
export { ProtectedRoute } from "@shared/router/ProtectedRoute.tsx";
export { PublicRoute } from "@shared/router/PublicRoute.tsx";
export { default as RoleGuard } from "@shared/router/RoleGuard.tsx";

// Route configuration
export * from "@shared/router/routes.ts";
