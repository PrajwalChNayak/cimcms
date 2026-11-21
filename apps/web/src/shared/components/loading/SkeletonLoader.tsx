import React from "react";

interface SkeletonLoaderProps {
    lines?: number;
    className?: string;
    animated?: boolean;
}

const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
    lines = 3,
    className = "",
    animated = true,
}) => {
    return (
        <div className={`space-y-3 ${className}`}>
            {Array.from({ length: lines }).map((_, index) => (
                <div
                    key={index}
                    className={`
          h-4 bg-gray-200 rounded
          ${animated ? "animate-pulse" : ""}
          ${index === lines - 1 ? "w-3/4" : "w-full"}
        `}
                />
            ))}
        </div>
    );
};

export default SkeletonLoader;