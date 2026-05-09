import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";
import type { FarmSummary } from "@appTypes/farm.types";
import { mockFarmSummaries } from "@api/mockData";

interface FarmsState {
  items: FarmSummary[];
  selectedFarmId: string | null;
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
}

const initialState: FarmsState = {
  items: mockFarmSummaries,
  selectedFarmId: null,
  isLoading: false,
  error: null,
  searchQuery: "",
};

const farmsSlice = createSlice({
  name: "farms",
  initialState,
  reducers: {
    setFarms(state, action: PayloadAction<FarmSummary[]>) {
      state.items = action.payload;
    },
    selectFarm(state, action: PayloadAction<string | null>) {
      state.selectedFarmId = action.payload;
    },
    setFarmsLoading(state, action: PayloadAction<boolean>) {
      state.isLoading = action.payload;
    },
    setFarmsError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
    setFarmsSearch(state, action: PayloadAction<string>) {
      state.searchQuery = action.payload;
    },
    addFarm(state, action: PayloadAction<FarmSummary>) {
      state.items.push(action.payload);
    },
    updateFarm(state, action: PayloadAction<Partial<FarmSummary> & { id: string }>) {
      const idx = state.items.findIndex((f) => f.id === action.payload.id);
      if (idx !== -1) {
        state.items[idx] = { ...state.items[idx], ...action.payload };
      }
    },
    removeFarm(state, action: PayloadAction<string>) {
      state.items = state.items.filter((f) => f.id !== action.payload);
    },
  },
});

export const {
  setFarms,
  selectFarm,
  setFarmsLoading,
  setFarmsError,
  setFarmsSearch,
  addFarm,
  updateFarm,
  removeFarm,
} = farmsSlice.actions;

// Selectors
export const selectFarmsState = (state: { farms: FarmsState }) => state.farms;
export const selectAllFarms = (state: { farms: FarmsState }) => state.farms.items;
export const selectSelectedFarmId = (state: { farms: FarmsState }) => state.farms.selectedFarmId;
export const selectFarmsSearch = (state: { farms: FarmsState }) => state.farms.searchQuery;
export const selectFarmsLoading = (state: { farms: FarmsState }) => state.farms.isLoading;

export default farmsSlice.reducer;
