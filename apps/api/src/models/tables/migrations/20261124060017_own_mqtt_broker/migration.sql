/*
  Warnings:

  - You are about to drop the `DeviceMqttAccount` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "MqttAccountKind" AS ENUM ('DEVICE', 'SERVICE', 'LEGACY');

-- DropTable
DROP TABLE "DeviceMqttAccount";

-- CreateTable
CREATE TABLE "MqttAccount" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "kind" "MqttAccountKind" NOT NULL,
    "deviceId" TEXT,
    "deviceType" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "passwordSetAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MqttAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MqttRetained" (
    "topic" TEXT NOT NULL,
    "payload" BYTEA NOT NULL,
    "qos" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MqttRetained_pkey" PRIMARY KEY ("topic")
);

-- CreateIndex
CREATE UNIQUE INDEX "MqttAccount_username_key" ON "MqttAccount"("username");

-- CreateIndex
CREATE UNIQUE INDEX "MqttAccount_deviceId_key" ON "MqttAccount"("deviceId");
