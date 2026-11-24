import authenticateToken from '@/middleware/auth.middleware';
import { requirePermission } from '@/middleware/permission.middleware';
import { validate } from '@/middleware/validate.middleware';
import DeviceController from '@controllers/device.controller';
import {
  deviceIdSchema,
  idParamSchema,
  idSchema,
  registerDeviceBodySchema,
  updateDeviceBodySchema,
} from '@cimcms/contracts';
import { Router } from 'express';
import { z } from 'zod';

// `id` is the physical device id (the controller reads it as `id`).
const assignBody = z.object({
  id: deviceIdSchema,
  consumerId: idSchema,
  farmId: idSchema,
  name: z.string().trim().max(120).optional(),
  type: z.string().trim().max(60).optional(),
  location: z.string().trim().max(200).optional(),
});


/**
 * Legacy device management routes. Writes need DEVICE_MANAGE (plan section 7), reads
 * DEVICE_READ. They were unauthenticated in the imported code.
 */
export default (router: Router): void => {
  const manage = [authenticateToken, requirePermission('DEVICE_MANAGE')];
  const read = [authenticateToken, requirePermission('DEVICE_READ')];

  router.post('/devices/register', ...manage, validate({ body: registerDeviceBodySchema }), DeviceController.createDevice);
  router.post('/devices/farmer', ...manage, validate({ body: assignBody }), DeviceController.createDeviceFarmer);
  router.get('/devices/consumer', ...read, DeviceController.getDevicesByConsumerId);
  router.get('/devices/:id/mqtt-account', ...manage, validate({ params: idParamSchema }), DeviceController.getMqttAccount);
  router.post(
    '/devices/:id/mqtt-account/password',
    ...manage,
    validate({ params: idParamSchema }),
    DeviceController.resetMqttPassword,
  );
  router.get('/devices/:id', ...read, validate({ params: idParamSchema }), DeviceController.getDeviceById);
  router.put(
    '/devices/:id',
    ...manage,
    validate({ params: idParamSchema, body: updateDeviceBodySchema }),
    DeviceController.updateDevice,
  );
  router.delete('/devices/:id', ...manage, validate({ params: idParamSchema }), DeviceController.deleteDevice);
};
