import React from "react";

type SpinnerSize = "small" | "medium" | "large" | "xlarge";
type SpinnerColor = "primary" | "secondary" | "success" | "warning" | "danger";

interface LoadingSpinnerProps {
  size?: SpinnerSize;
  color?: SpinnerColor;
  message?: string;
  className?: string;
}

const sizeClasses: Record<SpinnerSize, string> = {
  small: "h-4 w-4",
  medium: "h-8 w-8",
  large: "h-12 w-12",
  xlarge: "h-16 w-16",
};

const colorClasses: Record<SpinnerColor, string> = {
  primary: "border-blue-600",
  secondary: "border-gray-600",
  success: "border-green-600",
  warning: "border-yellow-600",
  danger: "border-red-600",
};

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = "medium",
  color = "primary",
  message = "Loading...",
  className = "",
}) => {
  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div
        className={`
        ${sizeClasses[size]} 
        ${colorClasses[color]}
        border-4 border-t-transparent border-r-transparent
        rounded-full animate-spin
      `}
      />
      {message && (
        <p className="mt-2 text-sm text-gray-600 text-center">{message}</p>
      )}
    </div>
  );
};

export default LoadingSpinner;