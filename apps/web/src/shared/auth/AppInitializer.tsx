import { refreshSession } from "@api/baseApi";
import { SplashScreen } from "@shared/components/splash";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { selectIsInitialized, setInitialized } from "@store/slices/authSlice";
import { useStore } from "react-redux";
import { useEffect, useState, type ReactNode } from "react";

interface AppInitializerProps {
  children: ReactNode;
  /** Minimum splash time in ms (the branded splash plays at least this long). */
  splashMinDuration?: number;
}

/**
 * Boot-time session restore: the access token lives in memory only, so on every
 * page load we call the refresh endpoint (HttpOnly cookie). Success stores the
 * token + user; failure leaves the app unauthenticated (login page).
 * The splash is shown until the attempt has finished and the splash has played.
 */
export const AppInitializer = ({
  children,
  splashMinDuration = 3000,
}: AppInitializerProps) => {
  const dispatch = useAppDispatch();
  const store = useStore();
  const isInitialized = useAppSelector(selectIsInitialized);
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // refreshSession shares one in-flight request (safe under StrictMode).
    void refreshSession(store).finally(() => {
      if (!cancelled) dispatch(setInitialized(true));
    });
    return () => {
      cancelled = true;
    };
  }, [dispatch, store]);

  if (!splashDone || !isInitialized) {
    return (
      <SplashScreen
        minDuration={splashMinDuration}
        onFinished={() => setSplashDone(true)}
      />
    );
  }
  return <>{children}</>;
};

export default AppInitializer;
