import DeviceController from "@controllers/device.controller";
import { Router } from "express";

export default (router: Router): void => {
  router.post("/devices", DeviceController.createDevice);
  router.get("/devices/consumer", DeviceController.getDevicesByConsumerId);
  router.get("/devices/:id", DeviceController.getDeviceById);
  router.put("/devices/:id", DeviceController.updateDevice);
  router.delete("/devices/:id", DeviceController.deleteDevice);
};
