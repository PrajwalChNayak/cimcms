import MasterController from '@/controllers/master.controler';
import authenticateToken from '@/middleware/auth.middleware';
import { Router } from 'express';

export default (router: Router): void => {
  router.post('/master/constant', authenticateToken, MasterController.createMasterTypeConstant);
  router.get('/master/constant', authenticateToken, MasterController.getMasterTypeConstants);

  router.get('/master/constant/types', authenticateToken, MasterController.getMasterTypeConstantTypes);

};
