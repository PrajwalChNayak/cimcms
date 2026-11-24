import type { Device } from '@prisma/client';
import { MqttDispatcher } from '@/mqtt/mqtt.dispatcher';
import MqttAccountService, { type AccountActor } from '@services/mqttaccount.service';
import DeviceRepository from '@repositories/device.repository';
import { NotFoundError } from '@utils/errors/custom.errors';

type DeviceCreateInput = Pick<Device, 'deviceId' | 'deviceType'> &
  Partial<Omit<Device, 'id' | 'createdAt' | 'updatedAt' | 'deviceId' | 'deviceType'>>;

class DeviceService {
  static async createDevice(data: DeviceCreateInput): Promise<Device> {
    // `type` mirrors `deviceType`, as the seed does.
    const device = await DeviceRepository.create<Device>({ type: data.deviceType, ...data } as Record<string, unknown>);
    // A controller that tried to connect before it was registered was cached as unknown:
    // forget that so its next message is accepted at once.
    MqttDispatcher.forget(device.deviceId);
    return device;
  }

  static async createDeviceFarmer(
    deviceId: string,
    data: Partial<DeviceCreateInput>,
  ): Promise<Device> {
    const existing = await DeviceRepository.findOne<Device>({ deviceId });

    if (!existing) throw new NotFoundError('Device not found');

    return DeviceRepository.updateById<Device>(
      existing.id,
      data as Record<string, unknown>,
    );
  }

  static async getDevicesByConsumerId(
    consumerId: string,
    page: number,
    limit: number,
    name?: string,
    type?: string,
    location?: string,
    deviceId?: string,
    farmId?: string,
  ) {
    const searchParams: Record<string, unknown> = { consumerId };
    if (name) searchParams.name = name;
    if (type) searchParams.type = type;
    if (location) searchParams.location = location;
    if (deviceId) searchParams.deviceId = deviceId;
    if (farmId) searchParams.farmId = farmId;
    return DeviceRepository.findAll<Device>(page, limit, searchParams, {
      additionalWhere: {},
      orderBy: { createdAt: 'desc' },
    });
  }

  static async getDeviceById(id: string): Promise<Device> {
    const device = await DeviceRepository.findOne<Device>(
      { id },
      {
        // Never return the consumer's password hash.
        include: {
          consumer: { select: { id: true, email: true, name: true, mobileNumber: true } },
          farm: true,
        },
      },
    );
    if (!device) throw new NotFoundError('Device not found');
    return device;
  }

  static async updateDevice(
    id: string,
    data: Partial<DeviceCreateInput>,
  ): Promise<Device> {
    const existing = await DeviceRepository.findOne<Device>({ id });
    if (!existing) throw new NotFoundError('Device not found');
    return DeviceRepository.updateById<Device>(
      id,
      data as Record<string, unknown>,
    );
  }

  static async deleteDevice(id: string, actor: AccountActor = {}): Promise<Device> {
    const existing = await DeviceRepository.findOne<Device>({ id });
    if (!existing) throw new NotFoundError('Device not found');
    // Remove its broker account first: if that fails, the device stays (consistent).
    await MqttAccountService.remove(existing.deviceId, actor);
    const deleted = await DeviceRepository.deleteById<Device>(id, false);
    MqttDispatcher.forget(existing.deviceId);
    return deleted;
  }
}

export default DeviceService;
