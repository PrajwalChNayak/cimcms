import authenticateToken from '@/middleware/auth.middleware';
import DeviceController from '@controllers/device.controller';
import { Router } from 'express';

export default (router: Router): void => {
  // router.post('/devices/register', authenticateToken, DeviceController.createDevice);

  // router.post('/devices/farmer', authenticateToken, DeviceController.createDeviceFarmer);

  // router.get('/devices/consumer', authenticateToken, DeviceController.getDevicesByConsumerId);

  // // router.get('/devices', authenticateToken, DeviceController.getAllDevices);

  // router.get('/devices/:id', authenticateToken, DeviceController.getDeviceById);

  // router.put('/devices/:id', authenticateToken, DeviceController.updateDevice);

  // router.delete('/devices/:id', authenticateToken, DeviceController.deleteDevice);

   router.post('/devices/register', DeviceController.createDevice);

  router.post('/devices/farmer', DeviceController.createDeviceFarmer);

  router.get('/devices/consumer', DeviceController.getDevicesByConsumerId);


  router.get('/devices/:id', DeviceController.getDeviceById);

  router.put('/devices/:id', DeviceController.updateDevice);

  router.delete('/devices/:id', DeviceController.deleteDevice);
};
