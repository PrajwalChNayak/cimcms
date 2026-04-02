import type { Device } from "@prisma/client";
import DeviceRepository from "@repositories/device.repository";
import { NotFoundError } from "@utils/errors/custom.errors";

type DeviceCreateInput = Omit<Device, "id" | "createdAt" | "updatedAt">;

class DeviceService {
  static async createDeviceFarmer(data: DeviceCreateInput): Promise<Device> {
    return DeviceRepository.create<Device>(data as Record<string, unknown>);
  }

  static async getDevicesByConsumerId(
    page: number,
    limit: number,
    name?: string,
    type?: string,
    location?: string,
    deviceId?: string,
    consumerId: string,
    farmId?: string,
  ) {
    const searchParams: Record<string, unknown> = {consumerId};
    if (name) searchParams.name = name;
    if (type) searchParams.type = type;
    if (location) searchParams.location = location;
    if (deviceId) searchParams.deviceId = deviceId;
    if (farmId) searchParams.farmId = farmId;
    console.log("Search Params:", searchParams); // Debug log to check search parameters
    return DeviceRepository.findAll<Device>(page, limit, searchParams, {
      additionalWhere: {},
      orderBy: { createdAt: "desc" },
    });
  }

  static async getDeviceById(id: string): Promise<Device> {
    const device = await DeviceRepository.findOne<Device>(
      { id },
      {
        include: { consumer: true, farm: true },
      },
    );
    if (!device) throw new NotFoundError("Device not found");
    return device;
  }

  static async updateDevice(
    id: string,
    data: Partial<DeviceCreateInput>,
  ): Promise<Device> {
    const existing = await DeviceRepository.findOne<Device>({ id });
    if (!existing) throw new NotFoundError("Device not found");
    return DeviceRepository.updateById<Device>(
      id as unknown as number,
      data as Record<string, unknown>,
    );
  }

  static async deleteDevice(id: string): Promise<Device> {
    const existing = await DeviceRepository.findOne<Device>({ id });
    if (!existing) throw new NotFoundError("Device not found");
    return DeviceRepository.deleteById<Device>(id as unknown as number, false);
  }
}

export default DeviceService;
