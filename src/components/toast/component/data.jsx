const ToastTypes = {
    SUCCESS: 'success',
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info'
  };
  
  const toastConfig = {
    [ToastTypes.SUCCESS]: {
      icon: (
        <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
      ),
      style: {
        container: 'bg-gradient-to-r from-green-50 to-green-100 ring-green-500/10',
        icon: 'bg-green-100 text-green-600',
        title: 'text-green-900',
        message: 'text-green-800',
        button: 'text-green-600 hover:bg-green-200 focus:ring-green-500'
      }
    },
    [ToastTypes.ERROR]: {
      icon: (
        <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/>
        </svg>
      ),
      style: {
        container: 'bg-gradient-to-r from-red-50 to-red-100 ring-red-500/10',
        icon: 'bg-red-100 text-red-600',
        title: 'text-red-900',
        message: 'text-red-800',
        button: 'text-red-600 hover:bg-red-200 focus:ring-red-500'
      }
    },
    [ToastTypes.WARNING]: {
      icon: (
        <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
        </svg>
      ),
      style: {
        container: 'bg-gradient-to-r from-yellow-50 to-yellow-100 ring-yellow-500/10',
        icon: 'bg-yellow-100 text-yellow-600',
        title: 'text-yellow-900',
        message: 'text-yellow-800',
        button: 'text-yellow-600 hover:bg-yellow-200 focus:ring-yellow-500'
      }
    },
    [ToastTypes.INFO]: {
      icon: (
        <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"/>
        </svg>
      ),
      style: {
        container: 'bg-gradient-to-r from-blue-50 to-blue-100 ring-blue-500/10',
        icon: 'bg-blue-100 text-blue-600',
        title: 'text-blue-900',
        message: 'text-blue-800',
        button: 'text-blue-600 hover:bg-blue-200 focus:ring-blue-500'
      }
    }
  };