import { AppInitializer } from "@shared/auth/AppInitializer";
import { RealtimeBootstrap } from "@shared/realtime/RealtimeBootstrap";
import { AppRouter } from "@shared/router";
import { persistor, store } from "@store/index";
import React from "react";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";

/**
 * Root App Component
 * Entry point for the entire application with global providers and setup
 */
const App: React.FC = () => (
  <Provider store={store}>
    <PersistGate persistor={persistor}>
      {/* Splash + session restore (refresh cookie) before any route renders */}
      <AppInitializer>
        <RealtimeBootstrap />
        <div className="App">
          {/* Main application router */}
          <AppRouter />
        </div>
      </AppInitializer>
    </PersistGate>
  </Provider>
);

export default App;
