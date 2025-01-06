import { useForm } from "react-hook-form";
import { ParticlesBackground } from "../../../components/particles";
import LoginForm from "./components/form";
import { useLoginUser } from "./components/function";
import { useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";

export default function Login() {
    const { register, handleSubmit, formState: { errors }, reset } = useForm({
        mode: "onChange",

    });
    const navigate = useNavigate();
 
    const { mutate: loginUser } = useLoginUser();
    const onSubmit = (data) => {
        loginUser(data);
    }
    return (
        <div className="min-h-screen m-0 flex items-center justify-center relative overflow-hidden">
            <ParticlesBackground />
            <div className="w-[450px] bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-10 relative overflow-hidden">
                {/* Background Animation */}
                <div className="absolute top-0 left-0 w-full h-2 bg-blue-500 animate-pulse-slow"></div>

                {/* Login Form */}
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-tech text-blue-600 mb-2">IoT Dashboard</h1>
                    <p className="text-gray-500 font-tech">Please login to continue</p>
                </div>

                <LoginForm
                    register={register}
                    onSubmit={handleSubmit(onSubmit)}
                />
                {/* Status Message */}
                <div id="statusMessage" className="mt-4 text-center font-tech text-red-500"></div>
            </div>
        </div>
    )
}