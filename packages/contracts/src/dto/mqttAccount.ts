import { z } from 'zod';
import { deviceDtoSchema } from './index.js';

const iso = z.string().datetime();

/** How device broker accounts are created: by the API in the CIMCMS broker's database, or by hand. */
export const MQTT_PROVISIONING_MODES = ['broker', 'manual'] as const;
export type MqttProvisioningMode = (typeof MQTT_PROVISIONING_MODES)[number];

/** Topics of one device, for the firmware settings shown in the UI. */
export const deviceTopicsDtoSchema = z.object({
  base: z.string(),
  publish: z.array(z.string()),
  subscribe: z.array(z.string()),
});
export type DeviceTopicsDto = z.infer<typeof deviceTopicsDtoSchema>;

/** Returned ONCE when an account is created or its password reset. The password is never stored. */
export const mqttCredentialsDtoSchema = z.object({
  username: z.string(),
  clientId: z.string(),
  password: z.string(),
  /** Broker address for the device (MQTT_DEVICE_URL); null when not configured. */
  brokerUrl: z.string().nullable(),
  topics: deviceTopicsDtoSchema,
});
export type MqttCredentialsDto = z.infer<typeof mqttCredentialsDtoSchema>;

/** GET /devices/:id/mqtt-account: account state without any secret. */
export const mqttAccountDtoSchema = z.object({
  provisioning: z.enum(MQTT_PROVISIONING_MODES),
  exists: z.boolean(),
  username: z.string(),
  clientId: z.string(),
  createdAt: iso.nullable(),
  passwordSetAt: iso.nullable(),
  brokerUrl: z.string().nullable(),
  topics: deviceTopicsDtoSchema,
});
export type MqttAccountDto = z.infer<typeof mqttAccountDtoSchema>;

/** POST /devices/register result. `credentials` is set only when the API created the account. */
export const registerDeviceResultDtoSchema = z.object({
  device: deviceDtoSchema,
  provisioning: z.enum(MQTT_PROVISIONING_MODES),
  credentials: mqttCredentialsDtoSchema.nullable(),
  /** Set when automatic account creation failed; the device itself was saved. */
  provisioningError: z.string().nullable(),
});
export type RegisterDeviceResultDto = z.infer<typeof registerDeviceResultDtoSchema>;
