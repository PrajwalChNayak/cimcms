import { forwardRef, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ label, error, className = '', id, ...props }, ref) => {
        const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

        return (
            <div className="w-full">
                {label && (
                    <label htmlFor={inputId} className="block text-sm font-medium text-[#003324] mb-1.5">
                        {label}
                    </label>
                )}
                <input
                    ref={ref}
                    id={inputId}
                    className={`w-full rounded-lg border px-4 py-2.5 text-[#003324] placeholder-[#8A9597] transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#76B82A]/50 focus:border-[#76B82A] ${error ? 'border-[#D32F2F] focus:ring-[#D32F2F]/50 focus:border-[#D32F2F]' : 'border-[#E0E4E5]'
                        } ${className}`}
                    {...props}
                />
                {error && <p className="mt-1 text-sm text-[#D32F2F]">{error}</p>}
            </div>
        );
    }
);

Input.displayName = 'Input';

export default Input;
