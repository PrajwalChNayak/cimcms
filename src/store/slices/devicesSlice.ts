import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";
import type { Device } from "@appTypes/device.types";
import { mockDevices } from "@api/mockData";

interface DevicesState {
  items: Device[];
  selectedDeviceId: string | null;
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  filterFarmId: string | null;
  filterStatus: Device["status"] | "all";
  filterType: string | "all";
}

const initialState: DevicesState = {
  items: mockDevices,
  selectedDeviceId: null,
  isLoading: false,
  error: null,
  searchQuery: "",
  filterFarmId: null,
  filterStatus: "all",
  filterType: "all",
};

const devicesSlice = createSlice({
  name: "devices",
  initialState,
  reducers: {
    setDevices(state, action: PayloadAction<Device[]>) {
      state.items = action.payload;
    },
    selectDevice(state, action: PayloadAction<string | null>) {
      state.selectedDeviceId = action.payload;
    },
    setDevicesLoading(state, action: PayloadAction<boolean>) {
      state.isLoading = action.payload;
    },
    setDevicesError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
    setDevicesSearch(state, action: PayloadAction<string>) {
      state.searchQuery = action.payload;
    },
    setDevicesFilterFarm(state, action: PayloadAction<string | null>) {
      state.filterFarmId = action.payload;
    },
    setDevicesFilterStatus(state, action: PayloadAction<Device["status"] | "all">) {
      state.filterStatus = action.payload;
    },
    setDevicesFilterType(state, action: PayloadAction<string | "all">) {
      state.filterType = action.payload;
    },
    addDevice(state, action: PayloadAction<Device>) {
      state.items.push(action.payload);
    },
    updateDevice(state, action: PayloadAction<Partial<Device> & { id: string }>) {
      const idx = state.items.findIndex((d) => d.id === action.payload.id);
      if (idx !== -1) {
        state.items[idx] = { ...state.items[idx], ...action.payload };
      }
    },
    removeDevice(state, action: PayloadAction<string>) {
      state.items = state.items.filter((d) => d.id !== action.payload);
    },
    toggleDoorLock(state, action: PayloadAction<string>) {
      const device = state.items.find((d) => d.id === action.payload);
      if (device && device.type === "door_lock") {
        device.isLocked = !device.isLocked;
        const locked = device.isLocked;
        device.lastReading = {
          value: locked ? "Locked" : "Unlocked",
          timestamp: new Date().toISOString(),
        };
      }
    },
  },
});

export const {
  setDevices,
  selectDevice,
  setDevicesLoading,
  setDevicesError,
  setDevicesSearch,
  setDevicesFilterFarm,
  setDevicesFilterStatus,
  setDevicesFilterType,
  addDevice,
  updateDevice,
  removeDevice,
  toggleDoorLock,
} = devicesSlice.actions;

// Selectors
export const selectDevicesState = (state: { devices: DevicesState }) => state.devices;
export const selectAllDevices = (state: { devices: DevicesState }) => state.devices.items;
export const selectSelectedDeviceId = (state: { devices: DevicesState }) => state.devices.selectedDeviceId;
export const selectDevicesSearch = (state: { devices: DevicesState }) => state.devices.searchQuery;
export const selectDevicesFilterFarm = (state: { devices: DevicesState }) => state.devices.filterFarmId;
export const selectDevicesFilterStatus = (state: { devices: DevicesState }) => state.devices.filterStatus;
export const selectDevicesFilterType = (state: { devices: DevicesState }) => state.devices.filterType;
export const selectDevicesLoading = (state: { devices: DevicesState }) => state.devices.isLoading;
export const selectDevicesByFarm = (farmId: string) => (state: { devices: DevicesState }) =>
  state.devices.items.filter((d) => d.farmId === farmId);

export default devicesSlice.reducer;
