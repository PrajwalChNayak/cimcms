import { logError, logInfo } from "@shared/utils/logger";
import React, { ErrorInfo, ReactNode } from "react";
import { Link } from "react-router-dom";

interface ErrorBoundaryProps {
  children: ReactNode;
  name?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  componentStack: string | null;
  retryCount: number;
}

class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);

    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      componentStack: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const componentStack =
      errorInfo?.componentStack || "No component stack available";

    logError("Uncaught error in component", error, {
      componentStack,
      location: window.location.href,
      retryCount: this.state.retryCount,
      componentName: this.props.name || "Unknown component",
    });

    this.setState({
      errorInfo,
      componentStack,
    });
  }

  tryAgain = () => {
    const newRetryCount = this.state.retryCount + 1;

    logInfo("User attempting to retry after error", {
      retryCount: newRetryCount,
      previousError: this.state.error?.message,
      componentName: this.props.name || "Unknown component",
      location: window.location.href,
    });

    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      componentStack: null,
      retryCount: newRetryCount,
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-4 py-16">
          <div className="text-center max-w-md">
            <div className="flex justify-center mb-6">
              <div className="rounded-full bg-red-100 p-4">
                <svg
                  className="h-12 w-12 text-accent"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
            </div>

            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Something went wrong
            </h1>

            <p className="text-gray-600 mb-6">
              We're sorry for the inconvenience. Our team has been notified
              about this issue.
            </p>

            <div className="space-y-3">
              <Link
                to="/"
                className="inline-block w-full px-5 py-3 bg-primary text-white font-medium rounded-lg hover:bg-primary-dark transition-colors"
              >
                Return to Homepage
              </Link>

              <button
                onClick={this.tryAgain}
                className="inline-block w-full px-5 py-3 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Try Again
              </button>
            </div>

            {process.env.NODE_ENV === "development" && (
              <div className="mt-8 p-4 bg-gray-100 rounded-lg text-left overflow-auto max-h-64">
                <p className="text-red-600 font-semibold">Error Details:</p>

                <p className="text-gray-800 text-sm mt-2">
                  {this.state.error
                    ? this.state.error.toString()
                    : "Unknown error"}
                </p>

                {this.state.componentStack && (
                  <div className="mt-2">
                    <p className="text-red-600 font-semibold text-sm">
                      Component Stack:
                    </p>
                    <pre className="text-gray-800 text-xs mt-1 overflow-auto">
                      {this.state.componentStack}
                    </pre>
                  </div>
                )}

                {this.state.retryCount > 0 && (
                  <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
                    <p className="text-yellow-700 text-xs">
                      <span className="font-semibold">Note:</span> You've tried
                      to recover {this.state.retryCount} time
                      {this.state.retryCount !== 1 ? "s" : ""}.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;