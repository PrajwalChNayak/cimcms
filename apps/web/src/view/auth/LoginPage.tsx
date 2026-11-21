
import { useLoginMutation } from "@api/authApi";
import { setSession } from "@store/slices/authSlice";
import { type FormEvent, useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";

/* ── Decorative elements (matching Splash Screen) ── */

const LeafIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20c4 0 8.71-5.29 9-10z" fill="currentColor" opacity="0.6" />
    <path d="M17 8c.67-1 1.77-2.42 3-4 1.23 1.58 2.33 3 3 4-2 4.97-6.04 8-9.98 9.97L12 16c1-2 3-5.29 5-8z" fill="currentColor" opacity="0.35" />
  </svg>
);

const TechNode = ({ className, size = 6 }: { className?: string; size?: number }) => (
  <div className={`rounded-full border border-primary/20 ${className ?? ""}`} style={{ width: size, height: size }}>
    <div className="rounded-full bg-primary/30" style={{ width: size * 0.5, height: size * 0.5, margin: size * 0.25 - 0.5 }} />
  </div>
);

const ConnectorLine = ({ className, vertical = false }: { className?: string; vertical?: boolean }) => (
  <div
    className={`${vertical ? "w-px h-16" : "h-px w-16"} ${className ?? ""}`}
    style={{
      backgroundImage: vertical
        ? "linear-gradient(to bottom, var(--color-primary) 50%, transparent 50%)"
        : "linear-gradient(to right, var(--color-primary) 50%, transparent 50%)",
      backgroundSize: vertical ? "1px 8px" : "8px 1px",
      opacity: 0.12,
    }}
  />
);

/* ── Leaf + Circuit Logo (same as Splash Screen) ── */

const AppLogo = () => (
  <svg className="w-12 h-12 sm:w-14 sm:h-14" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M32 6C18 14 10 28 10 42c0 2 .5 4 1.5 5.5C14 52 22 54 32 54s18-2 20.5-6.5c1-1.5 1.5-3.5 1.5-5.5C54 28 46 14 32 6z" fill="var(--color-primary)" opacity="0.85" />
    <path d="M32 14v34" stroke="var(--color-surface)" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
    <path d="M32 22l-8 8M32 22l8 8M32 32l-10 6M32 32l10 6" stroke="var(--color-surface)" strokeWidth="1.5" strokeLinecap="round" opacity="0.45" />
    <circle cx="24" cy="30" r="2" fill="var(--color-primary-light)" />
    <circle cx="40" cy="30" r="2" fill="var(--color-primary-light)" />
    <circle cx="22" cy="38" r="1.5" fill="var(--color-accent)" />
    <circle cx="42" cy="38" r="1.5" fill="var(--color-accent)" />
    <path d="M24 30h-4M40 30h4" stroke="var(--color-primary-light)" strokeWidth="1" strokeLinecap="round" opacity="0.6" />
  </svg>
);

/* ── Icon helpers ── */

const EyeIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const EyeOffIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
  </svg>
);

const SpinnerIcon = () => (
  <svg className="animate-spin -ml-1 mr-2 h-4 w-4" viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

/* ── Login Page ── */

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [login, { isLoading }] = useLoginMutation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const response = await login({ email, password }).unwrap();
      dispatch(setSession(response.result));
      navigate("/dashboard", { replace: true });
    } catch (err) {
      const message =
        (err as { data?: { message?: string } })?.data?.message ??
        "Invalid email or password. Please try again.";
      setError(message);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden splash-gradient-bg">
      {/* Grid overlay */}
      <div className="absolute inset-0 splash-grid-bg" />

      {/* Radial glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: "min(600px, 90vw)",
            height: "min(600px, 90vw)",
            background: "radial-gradient(circle, rgba(118,184,42,0.06) 0%, transparent 70%)",
          }}
        />
      </div>

      {/* Floating leaves */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <LeafIcon className="splash-leaf-1 absolute bottom-[28%] left-[18%] w-7 h-7 text-primary" />
        <LeafIcon className="splash-leaf-2 absolute bottom-[22%] right-[20%] w-5 h-5 text-primary-light" />
        <LeafIcon className="splash-leaf-3 absolute bottom-[35%] left-[42%] w-6 h-6 text-primary/80" />
        <LeafIcon className="splash-leaf-4 absolute bottom-[25%] right-[35%] w-4 h-4 text-accent" />
      </div>

      {/* Tech nodes */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <TechNode className="absolute top-[15%] left-[12%]" size={8} />
        <TechNode className="absolute top-[20%] right-[15%]" size={6} />
        <TechNode className="absolute bottom-[18%] left-[25%]" size={5} />
        <TechNode className="absolute bottom-[30%] right-[10%]" size={7} />
        <ConnectorLine className="absolute top-[15%] left-[calc(12%+12px)]" />
        <ConnectorLine className="absolute top-[calc(20%+10px)] right-[15%]" vertical />
        <ConnectorLine className="absolute bottom-[18%] left-[calc(25%+10px)]" />
      </div>

      {/* ── Login Card ── */}
      <div className="relative z-10 w-full max-w-md px-4 splash-fade-in">
        <div
          className="rounded-card bg-surface/90 backdrop-blur-sm px-6 py-8 sm:px-10 sm:py-10"
          style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.06), 0 2px 12px rgba(118,184,42,0.08)" }}
        >
          {/* Logo + Brand */}
          <div className="flex flex-col items-center gap-2 mb-8">
            <div
              className="w-16 h-16 sm:w-18 sm:h-18 rounded-full bg-surface flex items-center justify-center"
              style={{ boxShadow: "0 4px 20px rgba(118,184,42,0.12), 0 1px 4px rgba(0,0,0,0.04)" }}
            >
              <AppLogo />
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <h1
                className="text-2xl sm:text-3xl font-bold tracking-tight"
                style={{ color: "var(--color-text-primary)" }}
              >
                Cultivo
                <span className="ml-1 font-light" style={{ color: "var(--color-secondary)" }}>IoT</span>
              </h1>
              <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                Sign in to your account
              </p>
            </div>
          </div>

          {/* Error banner */}
          {error && (
            <div
              className="mb-5 flex items-center gap-2 rounded-btn px-4 py-2.5 text-sm"
              style={{ backgroundColor: "rgba(211,47,47,0.08)", color: "var(--color-error)" }}
              role="alert"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium mb-1.5"
                style={{ color: "var(--color-text-primary)" }}
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-btn border border-border px-4 py-2.5 text-sm bg-surface text-text-primary placeholder-text-secondary transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              />
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  Password
                </label>
                <button
                  type="button"
                  className="text-xs font-medium hover:underline cursor-pointer"
                  style={{ color: "var(--color-primary)" }}
                  tabIndex={-1}
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-btn border border-border px-4 py-2.5 pr-11 text-sm bg-surface text-text-primary placeholder-text-secondary transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 rounded-btn py-2.5 text-sm sm:text-base font-semibold text-text-inverted bg-primary hover:bg-primary-light transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {isLoading ? (
                <><SpinnerIcon />Signing in…</>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-border)" }} />
            <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
              or continue with
            </span>
            <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-border)" }} />
          </div>

          {/* Social Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              className="flex items-center justify-center gap-2 rounded-btn border border-border py-2.5 text-sm font-medium text-text-primary bg-surface hover:bg-background transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Google
            </button>
            <button
              type="button"
              className="flex items-center justify-center gap-2 rounded-btn border border-border py-2.5 text-sm font-medium text-text-primary bg-surface hover:bg-background transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
              </svg>
              GitHub
            </button>
          </div>

          {/* Sign up link */}
          <p className="mt-6 text-center text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Don't have an account?{" "}
            <button
              type="button"
              onClick={() => navigate("/register")}
              className="font-semibold hover:underline cursor-pointer"
              style={{ color: "var(--color-primary)" }}
            >
              Sign up
            </button>
          </p>
        </div>
      </div>

      {/* Bottom branding */}
      <div className="absolute bottom-6 sm:bottom-8 z-10">
        <p className="text-xs tracking-wide" style={{ color: "var(--color-text-secondary)" }}>
          Powered by{" "}
          <span className="font-semibold" style={{ color: "var(--color-secondary)" }}>
            CPBall Research
          </span>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;