import WaterFlowDataService from "../services/waterFlowData.service.js";
import { Constants } from "../utils/constant.utils.js";
import { handleDataCreation, handleDataRetrieval, handleSuccess } from "../utils/responsehandler/index.utils.js";

class WaterFlowDataController {
  static async createReading(req, res) {
    const reading = await WaterFlowDataService.createReading(req.body);
    handleDataCreation(res, reading);
  }

  static async getReadingById(req, res) {
    const reading = await WaterFlowDataService.getReadingById(req.params.id);
    handleDataRetrieval(res, reading);
  }

  static async getReadingsByMacAddress(req, res) {
    const readings = await WaterFlowDataService.getReadingsByMacAddress(req.params.macAddress);
    handleDataRetrieval(res, readings);
  }

  static async getAllReadings(req, res) {
    const readings = await WaterFlowDataService.getAllReadings(req.query);
    handleDataRetrieval(res, readings);
  }

  static async updateReading(req, res) {
    const reading = await WaterFlowDataService.updateReading(req.params.id, req.body);
    handleSuccess(res, reading, Constants.DATA_UPDATE_SUCCESS_MESSAGE);
  }

  static async deleteReading(req, res) {
    const result = await WaterFlowDataService.deleteReading(req.params.id);
    handleSuccess(res, null, Constants.DATA_DELETE_MESSAGE);
  }

  static async getDeviceAnalytics(req, res) {
    const { macAddress, timeframe } = req.params;
    const analytics = await WaterFlowDataService.getDeviceAnalytics(macAddress, timeframe);
    handleDataRetrieval(res, analytics);
  }
}

export default WaterFlowDataController;