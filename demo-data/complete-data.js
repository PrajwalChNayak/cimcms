#!/usr/bin/env node

/**
 * Complete Demo Data Insertion Script
 * This script completes the remaining data insertions (stock movements and alerts)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Console colors for better output
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    reset: '\x1b[0m'
};

function colorLog(color, message) {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

async function completeDataInsertion() {
    try {
        colorLog('blue', '🔄 Completing Demo Data Insertion...\n');

        // Get existing data
        const users = await prisma.user.findMany();
        const products = await prisma.product.findMany();
        const waterFlowData = await prisma.waterFlowData.findMany();

        if (users.length === 0) {
            colorLog('red', '❌ No users found. Please run the main demo data script first.');
            return;
        }

        const adminUser = users.find(u => u.username === 'admin') || users[0];

        // Insert stock movements
        if (products.length > 0) {
            colorLog('blue', '📈 Inserting sample stock movements...');

            const movementTypes = ['INBOUND', 'OUTBOUND', 'ADJUSTMENT', 'TRANSFER'];

            for (let i = 0; i < 5; i++) {
                const product = products[Math.floor(Math.random() * products.length)];

                await prisma.stockMovement.create({
                    data: {
                        type: movementTypes[Math.floor(Math.random() * movementTypes.length)],
                        productId: product.id,
                        quantity: Math.floor(Math.random() * 50) + 1,
                        fromLocation: {
                            warehouseId: "WH001",
                            zone: "A",
                            aisle: `A-${Math.floor(Math.random() * 20) + 1}`
                        },
                        toLocation: {
                            warehouseId: "WH001",
                            zone: "B",
                            aisle: `B-${Math.floor(Math.random() * 20) + 1}`
                        },
                        metadata: {
                            reason: "Demo stock adjustment",
                            operator: adminUser.username,
                            timestamp: new Date().toISOString()
                        },
                        reference: `SM-${Date.now()}-${i}`,
                        createdBy: adminUser.id
                    }
                });

                colorLog('cyan', `   ✓ Created stock movement ${i + 1}/5`);
            }
        }

        // Insert alerts
        if (waterFlowData.length > 0) {
            colorLog('blue', '🚨 Inserting sample alerts...');

            const alertTypes = ['HIGH_FLOW', 'LOW_PRESSURE', 'HIGH_TDS', 'TEMPERATURE_ANOMALY'];
            const severities = ['LOW', 'MEDIUM', 'HIGH'];

            for (let i = 0; i < 3; i++) {
                const flowData = waterFlowData[Math.floor(Math.random() * waterFlowData.length)];
                const alertType = alertTypes[Math.floor(Math.random() * alertTypes.length)];
                const severity = severities[Math.floor(Math.random() * severities.length)];

                await prisma.alert.create({
                    data: {
                        type: alertType,
                        message: `${alertType.replace('_', ' ')} detected in ${flowData.location}`,
                        severity: severity,
                        flowDataId: flowData.id,
                        isResolved: Math.random() > 0.5,
                        resolvedAt: Math.random() > 0.5 ? new Date() : null
                    }
                });

                colorLog('cyan', `   ✓ Created alert ${i + 1}/3: ${alertType} (${severity})`);
            }
        }

        // Final summary
        colorLog('green', '\n✅ Demo data completion successful!');

        const finalCounts = {
            stockMovements: await prisma.stockMovement.count(),
            alerts: await prisma.alert.count()
        };

        colorLog('cyan', `📊 Final counts:`);
        colorLog('cyan', `   Stock Movements: ${finalCounts.stockMovements}`);
        colorLog('cyan', `   Alerts: ${finalCounts.alerts}`);

    } catch (error) {
        colorLog('red', `❌ Error: ${error.message}`);
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

completeDataInsertion();
