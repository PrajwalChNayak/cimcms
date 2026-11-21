import ErrorScreenLayout from "@view/errors/ErrorScreenLayout";
import { useNavigate } from "react-router-dom";

const ShieldIcon = () => (
  <svg className="w-16 h-16 sm:w-20 sm:h-20" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Shield body */}
    <path
      d="M40 8L14 20v18c0 16.6 11.1 32.1 26 36 14.9-3.9 26-19.4 26-36V20L40 8z"
      stroke="var(--color-error)" strokeWidth="2.5" fill="none" opacity="0.7"
    />
    <path
      d="M40 14L19 24v14c0 13.5 9 26 21 29.4C52 64 61 51.5 61 38V24L40 14z"
      fill="var(--color-error)" opacity="0.08"
    />
    {/* Lock icon inside shield */}
    <rect x="33" y="36" width="14" height="12" rx="2" stroke="var(--color-error)" strokeWidth="2" opacity="0.7" />
    <path d="M36 36v-4a4 4 0 018 0v4" stroke="var(--color-error)" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
    <circle cx="40" cy="42" r="1.5" fill="var(--color-error)" opacity="0.7" />
    {/* Tech circuit accents */}
    <circle cx="24" cy="30" r="1.5" fill="var(--color-accent)" />
    <circle cx="56" cy="30" r="1.5" fill="var(--color-accent)" />
    <path d="M24 30h-6M56 30h6" stroke="var(--color-primary-light)" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
  </svg>
);

const ForbiddenScreen: React.FC = () => {
  const navigate = useNavigate();

  return (
    <ErrorScreenLayout>
      <ShieldIcon />
      <h1
        className="text-7xl sm:text-8xl font-bold tracking-tighter"
        style={{ color: "var(--color-error)" }}
      >
        403
      </h1>
      <div className="flex flex-col items-center gap-2">
        <h2
          className="text-xl sm:text-2xl font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Access Forbidden
        </h2>
        <p
          className="text-sm sm:text-base text-center max-w-sm leading-relaxed"
          style={{ color: "var(--color-text-secondary)" }}
        >
          You don't have permission to access this resource. Contact your administrator if you believe this is an error.
        </p>
      </div>
      <button
        onClick={() => navigate("/")}
        className="mt-2 inline-flex items-center gap-2 px-6 py-2.5 rounded-btn text-sm sm:text-base font-semibold text-text-inverted bg-primary hover:bg-primary-light transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />
        </svg>
        Go Home
      </button>
    </ErrorScreenLayout>
  );
};

export default ForbiddenScreen;