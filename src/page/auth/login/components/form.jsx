import { useState } from "react";

export default function LoginForm({ register, onSubmit, isLoading }) {
    const [showPassword, setShowPassword] = useState(false);

    const togglePasswordVisibility = () => {
        setShowPassword(!showPassword);
    };

    return (
        <form id="loginForm" className="space-y-2 sm:space-y-3 md:space-y-4 relative z-10" onSubmit={onSubmit}>
            {/* Email Input */}
            <div className="group">
                <label className="block text-xs font-tech text-gray-300 mb-1 flex items-center">
                    <svg className="w-3 h-3 mr-1.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                    </svg>
                    Email Address
                </label>
                <div className="relative">
                    <input
                        type="email"
                        id="Email"
                        {...register("email", {
                            required: "Email is required",
                            pattern: {
                                value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                                message: "Invalid email address"
                            }
                        })}
                        className="w-full px-3 py-2 sm:px-3 sm:py-2.5 md:px-3 md:py-2.5 lg:px-3 lg:py-2.5 bg-white/5 border border-white/10 rounded-lg font-tech text-gray-200 placeholder-gray-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 transition-all duration-300 backdrop-blur-sm text-sm"
                        placeholder="Enter your email"
                        required="required"
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                        <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse"></div>
                    </div>
                </div>
            </div>

            {/* Password Input */}
            <div className="group">
                <label className="block text-xs font-tech text-gray-300 mb-1 flex items-center">
                    <svg className="w-3 h-3 mr-1.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Password
                </label>
                <div className="relative">
                    <input
                        type={showPassword ? "text" : "password"}
                        id="password"
                        {...register("password", {
                            required: "Password is required",
                            minLength: {
                                value: 6,
                                message: "Password must be at least 6 characters"
                            }
                        })}
                        className="w-full px-3 py-2 sm:px-3 sm:py-2.5 md:px-3 md:py-2.5 lg:px-3 lg:py-2.5 pr-10 bg-white/5 border border-white/10 rounded-lg font-tech text-gray-200 placeholder-gray-500 focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 transition-all duration-300 backdrop-blur-sm text-sm"
                        placeholder="Enter your password"
                        required="required"
                    />
                    <button
                        type="button"
                        onClick={togglePasswordVisibility}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-green-400 transition-colors duration-200"
                    >
                        {showPassword ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                            </svg>
                        ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                        )}
                    </button>
                </div>
            </div>

            {/* Remember Me & Forgot Password - extremely compact */}
            <div className="flex items-center justify-between">
                <div className="flex items-center">
                    <input
                        type="checkbox"
                        id="remember"
                        className="w-3 h-3 text-cyan-500 bg-white/5 border border-white/20 rounded focus:ring-cyan-500 focus:ring-2 focus:ring-offset-0 focus:ring-offset-transparent"
                    />
                    <label htmlFor="remember" className="ml-1.5 text-xs font-tech text-gray-400">Remember me</label>
                </div>
                <button
                    type="button"
                    className="text-xs font-tech text-cyan-400 hover:text-cyan-300 transition-colors duration-200"
                >
                    Forgot password?
                </button>
            </div>

            {/* Login Button - extremely compact */}
            <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-tech py-2 sm:py-2.5 md:py-2.5 lg:py-2.5 rounded-lg hover:from-cyan-600 hover:to-blue-600 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:ring-offset-2 focus:ring-offset-slate-900 transition-all duration-300 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group text-sm"
            >
                {isLoading ? (
                    <div className="flex items-center justify-center">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                        <span className="text-xs">Connecting...</span>
                    </div>
                ) : (
                    <div className="flex items-center justify-center">
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                        </svg>
                        <span className="text-xs">Access Dashboard</span>
                    </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
            </button>

            {/* Demo credentials hint - smaller */}
            <div className="text-center">
                <p className="text-xs text-gray-500 font-tech">
                    Demo: admin@aquasolve.com / password123
                </p>
            </div>
        </form>
    )
}