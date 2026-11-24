import type { DeviceType, RegisterDeviceResultDto } from '@cimcms/contracts';
import DeviceReadService from '@services/deviceread.service';
import DeviceService from '@services/device.service';
import MqttAccountService, { type AccountActor } from '@services/mqttaccount.service';
import {
  handleDataCreation,
  handleDataRetrieval,
  handleSuccess,
} from '@utils/responsehandler/index.utils';
import { Request, Response } from 'express';

const actorOf = (req: Request): AccountActor => ({
  userId: req.subject?.userId ?? null,
  email: req.subject?.email ?? null,
  ip: req.ip ?? null,
  requestId: req.requestId ?? null,
});

class DeviceController {
  /**
   * Registers a device and, unless MQTT_PROVISIONING=manual, creates its broker account.
   * The generated password is in this response only (never stored, never logged).
   */
  static async createDevice(req: Request, res: Response): Promise<void> {
    // Body validated by registerDeviceBodySchema (device.routes.ts).
    const { deviceId, deviceType, name, location } = req.body as {
      deviceId: string;
      deviceType: DeviceType;
      name?: string;
      location?: string;
    };
    const device = await DeviceService.createDevice({
      deviceId,
      deviceType,
      ...(name !== undefined && { name }),
      ...(location !== undefined && { location }),
    });

    const provisioning = MqttAccountService.mode();
    let credentials: RegisterDeviceResultDto['credentials'] = null;
    let provisioningError: string | null = null;
    if (provisioning === 'broker') {
      try {
        credentials = await MqttAccountService.provision(deviceId, deviceType, actorOf(req));
      } catch (e) {
        // The device is saved; the admin can retry from the device page (reset password).
        provisioningError = e instanceof Error ? e.message : 'Broker account could not be created';
      }
    }
    const result: RegisterDeviceResultDto = {
      device: DeviceReadService.toDeviceDto(device),
      provisioning,
      credentials,
      provisioningError,
    };
    res.set('Cache-Control', 'no-store');
    handleDataCreation(res, result, 'Device created successfully');
  }

  static async getMqttAccount(req: Request, res: Response): Promise<void> {
    const result = await MqttAccountService.status(String(req.params.id));
    handleDataRetrieval(res, result, 'Broker account fetched successfully');
  }

  /** New broker password (or a new account). Shown once in this response. */
  static async resetMqttPassword(req: Request, res: Response): Promise<void> {
    const result = await MqttAccountService.resetPassword(String(req.params.id), actorOf(req));
    res.set('Cache-Control', 'no-store');
    handleSuccess(res, result, 'Broker password reset');
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
    const result = await DeviceService.deleteDevice(id, actorOf(req));
    handleSuccess(res, result, 'Device deleted successfully');
  }
}

export default DeviceController;
