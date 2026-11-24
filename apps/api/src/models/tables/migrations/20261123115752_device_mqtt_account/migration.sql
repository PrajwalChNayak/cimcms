-- CreateTable
CREATE TABLE "DeviceMqttAccount" (
    "id" UUID NOT NULL,
    "deviceId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "passwordSetAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceMqttAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceMqttAccount_deviceId_key" ON "DeviceMqttAccount"("deviceId");
