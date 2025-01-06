import { login, logout } from '../reducer/authReducer';

// Simply return the action objects
export const loginAction = (adminData) => login(adminData);
export const userLogout = () => logout();
