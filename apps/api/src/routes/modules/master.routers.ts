import MasterController from '@/controllers/master.controler';
import authenticateToken from '@/middleware/auth.middleware';
import { requirePermission } from '@/middleware/permission.middleware';
import { Router } from 'express';

/** Master constants. They were unauthenticated in the imported code; now MASTER_* permissions. */
export default (router: Router): void => {
  router.post(
    '/master/constant',
    authenticateToken,
    requirePermission('MASTER_CREATE'),
    MasterController.createMasterTypeConstant,
  );
  router.get(
    '/master/constant',
    authenticateToken,
    requirePermission('MASTER_READ'),
    MasterController.getMasterTypeConstants,
  );
  router.get(
    '/master/constant/types',
    authenticateToken,
    requirePermission('MASTER_READ'),
    MasterController.getMasterTypeConstantTypes,
  );
};
