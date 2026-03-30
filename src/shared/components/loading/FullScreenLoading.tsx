import LoadingSpinner from "@shared/components/loading/LoadingSpinner";
import React from "react";

interface FullScreenLoadingProps {
    message?: string;
}

const FullScreenLoading: React.FC<FullScreenLoadingProps> = ({
    message = "Loading...",
}) => {
    return (
        <div className="fixed inset-0 bg-white bg-opacity-90 flex items-center justify-center z-50">
            <LoadingSpinner size="large" message={message} />
        </div>
    );
};

export default FullScreenLoading;