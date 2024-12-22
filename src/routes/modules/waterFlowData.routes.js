import WaterFlowDataController from "../../controllers/waterFlowData.controller.js";
import authenticateToken from "../../middleware/auth.middleware.js";
export default (router) => {
    router.post('/sensor', WaterFlowDataController.createReading);
    router.get('/water-flow', authenticateToken, WaterFlowDataController.getAllReadings);
    router.get('/water-flow/:id', authenticateToken, WaterFlowDataController.getReadingById);
    router.get('/water-flow/device/:macAddress', authenticateToken, WaterFlowDataController.getReadingsByMacAddress);
    router.get('/water-flow/analytics/:macAddress/:timeframe?', authenticateToken, WaterFlowDataController.getDeviceAnalytics);
    router.put('/water-flow/:id', authenticateToken, WaterFlowDataController.updateReading);
    router.delete('/water-flow/:id', authenticateToken, WaterFlowDataController.deleteReading);
};