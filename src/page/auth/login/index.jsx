import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { ParticlesBackground } from "../../../components/particles";
import LoginForm from "./components/form";
import { useLoginUser } from "./components/function";

export default function Login() {
    const { register, handleSubmit, formState: { errors }, reset } = useForm({
        mode: "onChange",
    });
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());

    const { mutate: loginUser } = useLoginUser();

    // Update time every second
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const onSubmit = (data) => {
        setIsLoading(true);
        loginUser(data, {
            onSuccess: () => {
                setIsLoading(false);
            },
            onError: () => {
                setIsLoading(false);
            }
        });
    }

    return (
        <div className="min-h-screen m-0 flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-900 to-cyan-900 p-2">
            <ParticlesBackground />

            {/* Animated background elements - reduced for mobile */}
            <div className="absolute inset-0 overflow-hidden">
                {/* Floating sensor icons - hidden on mobile */}
                <div className="absolute top-20 left-20 animate-float-slow opacity-20 hidden md:block">
                    <div className="w-8 h-8 border-2 border-cyan-400 rounded-full flex items-center justify-center">
                        <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                    </div>
                </div>
                <div className="absolute top-40 right-32 animate-float-slower opacity-20 hidden lg:block">
                    <div className="w-6 h-6 border-2 border-green-400 rounded-full flex items-center justify-center">
                        <div className="w-1 h-1 bg-green-400 rounded-full animate-pulse"></div>
                    </div>
                </div>
                <div className="absolute bottom-32 left-32 animate-float-slow opacity-20 hidden md:block">
                    <div className="w-10 h-10 border-2 border-blue-400 rounded-full flex items-center justify-center">
                        <div className="w-3 h-3 bg-blue-400 rounded-full animate-pulse"></div>
                    </div>
                </div>

                {/* Data flow lines - hidden on mobile */}
                <div className="absolute top-1/4 left-0 w-32 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-pulse hidden lg:block"></div>
                <div className="absolute bottom-1/4 right-0 w-32 h-px bg-gradient-to-l from-transparent via-green-400 to-transparent animate-pulse hidden lg:block"></div>
            </div>

            <div className="w-full max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg bg-white/10 backdrop-blur-xl rounded-xl sm:rounded-2xl shadow-2xl p-3 sm:p-4 md:p-6 lg:p-8 relative overflow-hidden border border-white/20">
                {/* Animated border */}
                <div className="absolute inset-0 rounded-xl sm:rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-500 to-green-500 opacity-20 animate-gradient-x"></div>
                <div className="absolute inset-[2px] rounded-xl sm:rounded-2xl bg-gradient-to-br from-slate-900/90 to-slate-800/90 backdrop-blur-xl"></div>

                {/* Header with dynamic elements - extremely compact */}
                <div className="relative z-10 text-center mb-3 sm:mb-4">
                    <div className="flex items-center justify-center mb-1 sm:mb-2">
                        <div className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 lg:w-10 lg:h-10 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-lg flex items-center justify-center mr-2 shadow-lg">
                            <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-4 md:h-4 lg:w-5 lg:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-tech text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 mb-0">
                                AquaSolve IoT
                            </h1>
                            <p className="text-xs text-gray-400 font-tech">Smart Agriculture Dashboard</p>
                        </div>
                    </div>

                    {/* Real-time clock - smaller */}
                    <div className="inline-block bg-white/10 backdrop-blur-sm rounded px-2 py-0.5 sm:px-2 sm:py-1 border border-white/20">
                        <p className="text-xs font-tech text-cyan-400">
                            {currentTime.toLocaleTimeString('en-US', {
                                hour12: false,
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit'
                            })}
                        </p>
                    </div>

                    <p className="text-gray-300 font-tech mt-1 text-xs">Monitor • Control • Optimize</p>
                </div>

                {/* Feature highlights - extremely compact */}
                <div className="relative z-10 mb-3 sm:mb-4 grid grid-cols-3 gap-1 sm:gap-1.5 md:gap-2">
                    <div className="text-center p-1 sm:p-1.5 bg-white/5 rounded border border-white/10 backdrop-blur-sm">
                        <div className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 mx-auto mb-0.5 bg-gradient-to-br from-blue-400 to-blue-600 rounded flex items-center justify-center">
                            <svg className="w-1.5 h-1.5 sm:w-2 sm:h-2 md:w-2.5 md:h-2.5 lg:w-3 lg:h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                        </div>
                        <p className="text-xs text-gray-400 font-tech">Sensors</p>
                    </div>
                    <div className="text-center p-1 sm:p-1.5 bg-white/5 rounded border border-white/10 backdrop-blur-sm">
                        <div className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 mx-auto mb-0.5 bg-gradient-to-br from-green-400 to-green-600 rounded flex items-center justify-center">
                            <svg className="w-1.5 h-1.5 sm:w-2 sm:h-2 md:w-2.5 md:h-2.5 lg:w-3 lg:h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                            </svg>
                        </div>
                        <p className="text-xs text-gray-400 font-tech">Control</p>
                    </div>
                    <div className="text-center p-1 sm:p-1.5 bg-white/5 rounded border border-white/10 backdrop-blur-sm">
                        <div className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 mx-auto mb-0.5 bg-gradient-to-br from-purple-400 to-purple-600 rounded flex items-center justify-center">
                            <svg className="w-1.5 h-1.5 sm:w-2 sm:h-2 md:w-2.5 md:h-2.5 lg:w-3 lg:h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                            </svg>
                        </div>
                        <p className="text-xs text-gray-400 font-tech">Shop</p>
                    </div>
                </div>

                <LoginForm
                    register={register}
                    onSubmit={handleSubmit(onSubmit)}
                    isLoading={isLoading}
                />

                {/* Status Message */}
                <div id="statusMessage" className="mt-2 sm:mt-3 text-center font-tech text-red-400 text-xs"></div>

                {/* Footer - extremely compact */}
                <div className="relative z-10 mt-2 sm:mt-3 text-center">
                    <p className="text-xs text-gray-500 font-tech">
                        Powered by IoT Technology • Secure Connection
                    </p>
                </div>
            </div>
        </div>
    )
}