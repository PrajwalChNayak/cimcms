import authenticateToken from '@/middleware/auth.middleware';
import { requirePermission } from '@/middleware/permission.middleware';
import { validate } from '@/middleware/validate.middleware';
import FarmController from '@controllers/farm.controller';
import { idParamSchema } from '@cimcms/contracts';
import { Router } from 'express';

/** Legacy farm routes. They were unauthenticated in the imported code; now FARM_* permissions. */
export default (router: Router): void => {
  router.post('/farms', authenticateToken, requirePermission('FARM_CREATE'), FarmController.createFarm);
  router.get('/farms/consumer', authenticateToken, requirePermission('FARM_READ'), FarmController.getFarmsByConsumerId);
  router.get(
    '/farms/:id',
    authenticateToken,
    requirePermission('FARM_READ'),
    validate({ params: idParamSchema }),
    FarmController.getFarmById,
  );
  router.put(
    '/farms/:id',
    authenticateToken,
    requirePermission('FARM_UPDATE'),
    validate({ params: idParamSchema }),
    FarmController.updateFarm,
  );
  router.delete(
    '/farms/:id',
    authenticateToken,
    requirePermission('FARM_DELETE'),
    validate({ params: idParamSchema }),
    FarmController.deleteFarm,
  );
};
