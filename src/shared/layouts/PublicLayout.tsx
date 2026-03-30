
import { Outlet } from "react-router-dom";

/**
 * Public Layout
 * Simple layout for public pages (landing, about, contact, etc.)
 */
export const PublicLayout = () => {
    return (

        <main className="flex-1 flex flex-col justify-center items-center min-h-screen">
            <Outlet />
        </main>

    );
};

export default PublicLayout;
