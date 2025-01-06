import { configureStore } from '@reduxjs/toolkit';
import { combineReducers } from 'redux';
import { persistReducer, persistStore } from 'redux-persist';
import sessionStorage from 'redux-persist/es/storage/session';
import authReducer from './reducer/authReducer';

const rootReducer = combineReducers({
    auth: authReducer,
});

const persistConfig = {
    key: 'root',
    storage: sessionStorage,
    whitelist: ['auth'],
    version: 1,
    debug: process.env.NODE_ENV !== 'production'
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

const middleware = (getDefaultMiddleware) => {
    const middlewares = getDefaultMiddleware({
        serializableCheck: {
            ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE']
        }
    });



    return middlewares;
};

const store = configureStore({
    reducer: persistedReducer,
    middleware,
    devTools: process.env.NODE_ENV !== 'production'
});

export const persistor = persistStore(store);
export default store;
