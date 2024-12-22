import WaterFlowDataService from "../services/waterFlowData.service.js";
import { Constants } from "../utils/constant.utils.js";
import { handelServerDataCreated, handelServerDataGet, handelServerSuccess, handelDataNotFound } from "../utils/responsehandler/index.utils.js";

class WaterFlowDataController {
  static async createReading(req, res) {
    const reading = await WaterFlowDataService.createReading(req.body);
    reading ? handelServerDataCreated(res, reading) : handelDataNotFound(res);
  }

  static async getReadingById(req, res) {
    const reading = await WaterFlowDataService.getReadingById(req.params.id);
    reading ? handelServerDataGet(res, reading) : handelDataNotFound(res);
  }

  static async getReadingsByMacAddress(req, res) {
    const readings = await WaterFlowDataService.getReadingsByMacAddress(req.params.macAddress);
    readings ? handelServerDataGet(res, readings) : handelDataNotFound(res);
  }

  static async getAllReadings(req, res) {
    const readings = await WaterFlowDataService.getAllReadings(req.query);
    readings ? handelServerDataGet(res, readings) : handelDataNotFound(res);
  }

  static async updateReading(req, res) {
    const reading = await WaterFlowDataService.updateReading(req.params.id, req.body);
    reading ? handelServerSuccess(res, reading, Constants.DATA_UPDATE_SUCCESS_MESSAGE) : handelDataNotFound(res);
  }

  static async deleteReading(req, res) {
    const result = await WaterFlowDataService.deleteReading(req.params.id);
    result ? handelServerSuccess(res, null, Constants.DATA_DELETE_MESSAGE) : handelDataNotFound(res);
  }

  static async getDeviceAnalytics(req, res) {
    const { macAddress, timeframe } = req.params;
    const analytics = await WaterFlowDataService.getDeviceAnalytics(macAddress, timeframe);
    analytics ? handelServerDataGet(res, analytics) : handelDataNotFound(res);
  }
}

export default WaterFlowDataController;