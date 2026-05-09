import { useSelector, useDispatch } from "react-redux";
import { useMemo } from "react";
import { selectAllFarms, selectFarmsSearch, setFarmsSearch, addFarm } from "@store/slices/farmsSlice";
import { selectAllDevices } from "@store/slices/devicesSlice";
import type { FarmSummary } from "@appTypes/farm.types";

export const useFarmsViewModel = () => {
  const dispatch = useDispatch();
  const farms = useSelector(selectAllFarms);
  const devices = useSelector(selectAllDevices);
  const searchQuery = useSelector(selectFarmsSearch);

  const filteredFarms = useMemo(
    () =>
      farms.filter(
        (f) =>
          f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          f.location.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [farms, searchQuery],
  );

  const totalOnline = farms.reduce((s, f) => s + f.onlineDevices, 0);
  const totalDevices = farms.reduce((s, f) => s + f.totalDevices, 0);
  const totalAlerts = farms.reduce((s, f) => s + f.alertCount, 0);

  const setSearch = (q: string) => dispatch(setFarmsSearch(q));

  const createFarm = (data: { name: string; location: string; description?: string }) => {
    const farm: FarmSummary = {
      id: `farm-${Date.now()}`,
      name: data.name,
      location: data.location,
      description: data.description,
      ownerId: "u-001",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      totalDevices: 0,
      onlineDevices: 0,
      offlineDevices: 0,
      alertCount: 0,
    };
    dispatch(addFarm(farm));
  };

  return {
    farms,
    filteredFarms,
    searchQuery,
    setSearch,
    createFarm,
    stats: { totalFarms: farms.length, totalDevices, totalOnline, totalAlerts },
  };
};
