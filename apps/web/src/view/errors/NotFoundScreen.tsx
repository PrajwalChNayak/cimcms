import ErrorScreenLayout from "@view/errors/ErrorScreenLayout";
import { useNavigate } from "react-router-dom";

const NotFoundIcon = () => (
  <svg className="w-16 h-16 sm:w-20 sm:h-20" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Magnifying glass body */}
    <circle cx="34" cy="34" r="20" stroke="var(--color-primary)" strokeWidth="3" opacity="0.8" />
    <circle cx="34" cy="34" r="14" stroke="var(--color-primary-light)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.4" />
    {/* Handle */}
    <line x1="49" y1="49" x2="66" y2="66" stroke="var(--color-secondary)" strokeWidth="4" strokeLinecap="round" opacity="0.7" />
    {/* Question mark inside */}
    <path d="M30 28c0-3.3 2.7-6 6-6s6 2.7 6 6c0 2.5-1.5 4-3.5 5-1 .5-1.5 1.2-1.5 2.2v1" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
    <circle cx="37" cy="41" r="1.5" fill="var(--color-primary)" opacity="0.7" />
    {/* Tech circuit accents */}
    <circle cx="22" cy="22" r="1.5" fill="var(--color-accent)" />
    <circle cx="46" cy="22" r="1.5" fill="var(--color-accent)" />
    <path d="M22 22h-6M46 22h6" stroke="var(--color-primary-light)" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
  </svg>
);

const NotFoundScreen: React.FC = () => {
  const navigate = useNavigate();

  return (
    <ErrorScreenLayout>
      <NotFoundIcon />
      <h1
        className="text-7xl sm:text-8xl font-bold tracking-tighter"
        style={{ color: "var(--color-primary)" }}
      >
        404
      </h1>
      <div className="flex flex-col items-center gap-2">
        <h2
          className="text-xl sm:text-2xl font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Page Not Found
        </h2>
        <p
          className="text-sm sm:text-base text-center max-w-sm leading-relaxed"
          style={{ color: "var(--color-text-secondary)" }}
        >
          The page you're looking for doesn't exist or has been moved to a new location.
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

export default NotFoundScreen;