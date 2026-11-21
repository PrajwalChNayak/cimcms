import { Outlet } from "react-router-dom";

/**
 * Authentication Layout
 * Layout for login, signup, forgot password, etc.
 */
export const AuthLayout = () => {
    return (
        <div className="min-h-screen flex">
            <Outlet />
        </div>
    );
};

export default AuthLayout;
