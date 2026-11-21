import { redirects } from "@shared/router/routes.ts";
import { selectIsAuthenticated } from "@store/slices/authSlice.ts";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { Navigate, useLocation } from "react-router-dom";

interface PublicRouteProps {
    children: ReactNode;
    redirectTo?: string;
    redirectIfAuthenticated?: boolean;
}

/**
 * PublicRoute component - Handles both login redirects and logout properly
 */
export const PublicRoute = ({
    children,
    redirectTo = redirects.afterLogin,
    redirectIfAuthenticated = true,
}: PublicRouteProps) => {
    const location = useLocation();
    const isAuthenticated = useSelector(selectIsAuthenticated);
    const [shouldRedirect, setShouldRedirect] = useState(false);
    const redirectCountRef = useRef(0);
    const lastAuthStateRef = useRef(isAuthenticated);
    const lastLocationRef = useRef(location.pathname);

    // Reset redirect counter when location actually changes
    useEffect(() => {
        if (lastLocationRef.current !== location.pathname) {
            redirectCountRef.current = 0;
            setShouldRedirect(false);
            lastLocationRef.current = location.pathname;
        }
    }, [location.pathname]);

    // Handle authentication state changes
    useEffect(() => {
        const authStateChanged = lastAuthStateRef.current !== isAuthenticated;
        lastAuthStateRef.current = isAuthenticated;

        // Only process if auth state actually changed
        if (!authStateChanged) return;

        if (isAuthenticated && redirectIfAuthenticated) {
            // User just logged in - redirect to dashboard
            redirectCountRef.current += 1;

            // Emergency brake
            if (redirectCountRef.current > 3) {
                console.error("PublicRoute: Too many redirect attempts, stopping");
                return;
            }

            const targetRoute =
                (location.state as { from?: { pathname?: string } } | null)?.from
                    ?.pathname ?? redirectTo;

            // Don't redirect to the same route
            if (targetRoute !== location.pathname) {
                setShouldRedirect(true);
            }
        } else if (!isAuthenticated) {
            // User logged out or is not authenticated - allow access to public routes
            setShouldRedirect(false);
            redirectCountRef.current = 0;
        }
    }, [isAuthenticated, redirectIfAuthenticated, redirectTo, location.pathname]);

    // Emergency fallback
    if (redirectCountRef.current > 3) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-yellow-50">
                <div className="text-center max-w-md p-8">
                    <div className="text-6xl mb-4">⚠️</div>
                    <h2 className="text-xl font-bold text-gray-800 mb-4">
                        Navigation Issue
                    </h2>
                    <p className="text-gray-600 mb-6">
                        Multiple redirect attempts detected.
                    </p>
                    <div className="space-y-3">
                        <button
                            onClick={() => {
                                redirectCountRef.current = 0;
                                setShouldRedirect(false);
                                window.location.href = redirectTo;
                            }}
                            className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                            Go to Dashboard
                        </button>
                        <button
                            onClick={() => {
                                redirectCountRef.current = 0;
                                setShouldRedirect(false);
                                window.location.href = "/login";
                            }}
                            className="w-full px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                        >
                            Go to Login
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // If user is authenticated and should be redirected, and we're not already there
    if (isAuthenticated && redirectIfAuthenticated && shouldRedirect) {
        const targetRoute =
            (location.state as { from?: { pathname?: string } } | null)?.from
                ?.pathname ?? redirectTo;
        return <Navigate to={targetRoute} replace />;
    }

    // User is not authenticated OR redirectIfAuthenticated is false - show public route
    return <>{children}</>;
};

export const GuestOnlyRoute = PublicRoute;
