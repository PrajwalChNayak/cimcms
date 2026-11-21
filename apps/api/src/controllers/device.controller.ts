import DeviceService from '@services/device.service';
import {
  handleDataCreation,
  handleDataRetrieval,
  handleSuccess,
} from '@utils/responsehandler/index.utils';
import { Request, Response } from 'express';

class DeviceController {
  static async createDevice(req: Request, res: Response): Promise<void> {
    const { deviceId, deviceType } = req.body;
    const result = await DeviceService.createDevice({
      deviceId,
      deviceType,
    });
    handleDataCreation(res, result, 'Device created successfully');
  }

  static async createDeviceFarmer(req: Request, res: Response): Promise<void> {
    const { id, name, type, location, consumerId, farmId } = req.body;

    const result = await DeviceService.createDeviceFarmer(id, {
      name,
      type,
      location,
      consumerId,
      farmId,
    });

    handleDataCreation(res, result, 'Device created successfully');
  }

  static async getDevicesByConsumerId(req: Request, res: Response): Promise<void> {
    const {
      page = '1',
      limit = '10',
      name,
      type,
      location,
      deviceId,
      consumerId,
      farmId,
    } = req.query;

    const result = await DeviceService.getDevicesByConsumerId(
      consumerId as string,
      +page,
      +limit,
      name as string | undefined,
      type as string | undefined,
      location as string | undefined,
      deviceId as string | undefined,
      farmId as string | undefined,
    );
    handleDataRetrieval(res, result, 'Devices fetched successfully');
  }

  static async getDeviceById(req: Request, res: Response): Promise<void> {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const result = await DeviceService.getDeviceById(id);
    handleSuccess(res, result, 'Device fetched successfully');
  }

  static async updateDevice(req: Request, res: Response): Promise<void> {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const result = await DeviceService.updateDevice(id, req.body);
    handleSuccess(res, result, 'Device updated successfully');
  }

  static async deleteDevice(req: Request, res: Response): Promise<void> {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const result = await DeviceService.deleteDevice(id);
    handleSuccess(res, result, 'Device deleted successfully');
  }
}

export default DeviceController;
