import { mockHistoricalData } from "@api/mockData";
import { selectAllDevices, toggleDoorLock } from "@store/slices/devicesSlice";
import { selectAllFarms } from "@store/slices/farmsSlice";
import { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";

export const useDeviceDetailViewModel = (deviceId: string | undefined) => {
  const dispatch = useDispatch();
  const devices = useSelector(selectAllDevices);
  const farms = useSelector(selectAllFarms);

  const device = useMemo(
    () => devices.find((d) => d.id === deviceId),
    [devices, deviceId],
  );

  const farm = useMemo(
    () => farms.find((f) => f.id === device?.farmId),
    [farms, device],
  );

  const history = deviceId ? (mockHistoricalData[deviceId] ?? []) : [];

  const handleToggleLock = () => {
    if (deviceId && device?.type === "door_lock") {
      dispatch(toggleDoorLock(deviceId));
    }
  };

  return { device, farm, history, handleToggleLock };
};
