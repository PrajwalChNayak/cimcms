import authenticateToken from '@/middleware/auth.middleware';
import FarmController from '@controllers/farm.controller';
import { Router } from 'express';

export default (router: Router): void => {
  // router.post('/farms', authenticateToken, FarmController.createFarm);

  // router.get('/farms/consumer', authenticateToken, FarmController.getFarmsByConsumerId);

  // router.get('/farms/:id', authenticateToken, FarmController.getFarmById);
  // router.put('/farms/:id', authenticateToken, FarmController.updateFarm);
  // router.delete('/farms/:id', authenticateToken, FarmController.deleteFarm);


  router.post('/farms', FarmController.createFarm);

  router.get('/farms/consumer', FarmController.getFarmsByConsumerId);

  router.get('/farms/:id', FarmController.getFarmById);
  router.put('/farms/:id', FarmController.updateFarm);
  router.delete('/farms/:id', FarmController.deleteFarm);
};
