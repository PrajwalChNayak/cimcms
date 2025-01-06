
export default function LoginForm({ register, onSubmit }) {
    return (
        <form id="loginForm" className="space-y-8" onSubmit={onSubmit}>
            {/* Username Input */}
            <div>
                <label className="block text-md font-tech text-gray-600 mb-2">Email</label>
                <div className="relative">
                    <input
                        type="text"
                        id="Email"
                        {...register("email", { required: "Email is required" })}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg font-tech focus:border-blue-500 focus:outline-none transition-colors"
                        required="required" />
                </div>
            </div>

            {/* Password Input */}
            <div>
                <label className="block text-md font-tech text-gray-600 mb-2">Password</label>
                <div className="relative">
                    <input
                        type="password"
                        id="password"
                        {...register("password", { required: "Password is required" })}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg font-tech focus:border-blue-500 focus:outline-none transition-colors"
                        required="required" />
                </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center">
                <input type="checkbox" id="remember" className="w-4 h-4 text-blue-500 border-2 border-gray-200 rounded focus:ring-blue-500" />
                <label htmlFor="remember" className="ml-2 text-sm font-tech text-gray-600">Remember me</label>
            </div>

            {/* Login Button */}
            <button type="submit"
                className="w-full bg-blue-500 text-white font-tech py-3 rounded-lg hover:bg-blue-600 transition-colors">
                Login
            </button>
        </form>

    )
}