import WaterFlowDataRepository from "../repositories/waterFlowData.repository.js";

class WaterFlowDataService {
  static async createReading(data) {
    return await WaterFlowDataRepository.create({
      ...data,
      timestamp: data.timestamp || new Date()
    });
  }

  static async getReadingById(id) {
    return await WaterFlowDataRepository.findById(id);
  }

  static async getReadingsByMacAddress(macAddress) {
    return await WaterFlowDataRepository.findByMacAddress(macAddress);
  }

  static async getAllReadings(query) {
    return await WaterFlowDataRepository.findAll(query);
  }

  static async updateReading(id, data) {
    return await WaterFlowDataRepository.update(id, data);
  }

  static async deleteReading(id) {
    return await WaterFlowDataRepository.delete(id);
  }

  static async getDeviceAnalytics(macAddress, timeframe = '24h') {
    const timeRanges = {
      '24h': { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      '7d': { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      '30d': { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    };

    return await WaterFlowDataRepository.getAnalytics(
      macAddress,
      timeRanges[timeframe] || timeRanges['24h']
    );
  }
}

export default WaterFlowDataService;