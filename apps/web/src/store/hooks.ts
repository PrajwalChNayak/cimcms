import type { Store } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@store/store";
import { useDispatch, useSelector, useStore } from "react-redux";

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
export const useAppStore = useStore.withTypes<Store<RootState>>();
