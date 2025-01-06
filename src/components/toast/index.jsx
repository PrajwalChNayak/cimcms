

const ToastContainer = ({ toasts, onClose }) => {
    return (
        <div aria-live="assertive" className="pointer-events-none fixed inset-0 flex items-end px-4 py-6 sm:items-start sm:p-6">
            <div className="flex w-full flex-col items-center space-y-4 sm:items-end">
                {toasts.map((toast, index) => (
                    <Toast
                        key={index}
                        type={toast.type}
                        title={toast.title}
                        message={toast.message}
                        onClose={() => onClose(index)}
                    />
                ))}
            </div>
        </div>
    );
};