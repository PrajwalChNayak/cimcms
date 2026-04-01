import { SplashScreen } from "@shared/components/splash";
import { AppRouter } from "@shared/router";
import { persistor, store } from "@store/index";
import React, { useState } from "react";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";




/**
 * Root App Component
 * Entry point for the entire application with global providers and setup
 */
const App: React.FC = () => {
  const [splashDone, setSplashDone] = useState(false);

  if (!splashDone) {
    return <SplashScreen onFinished={() => setSplashDone(true)} />;
  }

  return (
    <Provider store={store}>
      <PersistGate
        // loading={<LoadingSpinner fullscreen text="Loading application..." />}
        persistor={persistor}
      >
        <div className="App">
          {/* Main application router */}
          <AppRouter />

        </div>
      </PersistGate>
    </Provider>
  );
};

export default App;