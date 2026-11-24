-- Broker tables moved to the separate broker database (apps/broker/prisma).
DROP TABLE IF EXISTS "MqttAccount";
DROP TABLE IF EXISTS "MqttRetained";
DROP TYPE IF EXISTS "MqttAccountKind";
