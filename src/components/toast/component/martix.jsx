const Toast = ({ type, title, message, onClose }) => {
    const config = toastConfig[type];
    
    return (
      <div className={`toast-animate-slide-in pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg shadow-lg ring-1 ${config.style.container}`}>
        <div className="p-4">
          <div className="flex items-start">
            <div className={`flex-shrink-0 p-2 rounded-full ${config.style.icon}`}>
              {config.icon}
            </div>
            <div className="ml-4 w-0 flex-1">
              <p className={`text-base font-semibold ${config.style.title}`}>{title}</p>
              <p className={`mt-1 text-sm ${config.style.message}`}>{message}</p>
            </div>
            <div className="ml-4 flex flex-shrink-0">
              <button
                type="button"
                className={`inline-flex rounded-full p-1.5 focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors ${config.style.button}`}
                onClick={onClose}
              >
                <span className="sr-only">Close</span>
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };