#!/usr/bin/env node

/**
 * Data Verification Script for AquaSolve IoT
 * 
 * This script verifies that the demo data was inserted correctly
 * and displays a summary of all records in the database.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Console colors for better output
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    reset: '\x1b[0m',
    bright: '\x1b[1m'
};

function colorLog(color, message) {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

async function verifyData() {
    try {
        colorLog('bright', '🔍 AquaSolve IoT - Database Verification');
        colorLog('bright', '=====================================\n');

        // Get counts for all tables
        const counts = {
            roles: await prisma.role.count(),
            permissions: await prisma.permission.count(),
            rolePermissions: await prisma.rolePermission.count(),
            users: await prisma.user.count(),
            categories: await prisma.category.count(),
            brands: await prisma.brand.count(),
            products: await prisma.product.count(),
            warehouses: await prisma.warehouse.count(),
            suppliers: await prisma.supplier.count(),
            consumers: await prisma.consumer.count(),
            dataLoggers: await prisma.dataLogger.count(),
            waterFlowData: await prisma.waterFlowData.count(),
            inventory: await prisma.inventory.count(),
            stockMovements: await prisma.stockMovement.count(),
            alerts: await prisma.alert.count(),
            orders: await prisma.order.count(),
            purchases: await prisma.purchase.count()
        };

        colorLog('blue', '📊 Database Summary:');
        colorLog('blue', '==================');
        for (const [table, count] of Object.entries(counts)) {
            const emoji = count > 0 ? '✅' : '❌';
            const color = count > 0 ? 'green' : 'red';
            colorLog(color, `${emoji} ${table.padEnd(20)}: ${count} records`);
        }

        // Detailed verification
        colorLog('\n' + colors.yellow + '🔍 Detailed Verification:' + colors.reset);
        colorLog('yellow', '========================');

        // Check users with roles
        const usersWithRoles = await prisma.user.findMany({
            include: {
                role: true
            }
        });

        if (usersWithRoles.length > 0) {
            colorLog('green', '\n👥 Users with Roles:');
            usersWithRoles.forEach(user => {
                colorLog('cyan', `   • ${user.username} (${user.email}) - Role: ${user.role?.roleName || 'No Role'}`);
            });
        }

        // Check categories with hierarchy
        const categoriesWithParents = await prisma.category.findMany({
            include: {
                parent: true,
                children: true
            }
        });

        if (categoriesWithParents.length > 0) {
            colorLog('green', '\n📂 Category Hierarchy:');
            const parentCategories = categoriesWithParents.filter(cat => !cat.parentId);
            parentCategories.forEach(parent => {
                colorLog('cyan', `   • ${parent.name}`);
                const children = categoriesWithParents.filter(cat => cat.parentId === parent.id);
                children.forEach(child => {
                    colorLog('white', `     └─ ${child.name}`);
                });
            });
        }

        // Check products with relationships
        const productsWithDetails = await prisma.product.findMany({
            include: {
                category: true,
                brand: true,
                Inventory: true
            }
        });

        if (productsWithDetails.length > 0) {
            colorLog('green', '\n📦 Products:');
            productsWithDetails.forEach(product => {
                const inventoryCount = product.Inventory.length;
                colorLog('cyan', `   • ${product.name}`);
                colorLog('white', `     Category: ${product.category.name}, Brand: ${product.brand.name}`);
                colorLog('white', `     Price: ₹${product.price}, Inventory Locations: ${inventoryCount}`);
            });
        }

        // Check water flow data
        const recentWaterData = await prisma.waterFlowData.findMany({
            take: 5,
            orderBy: {
                timestamp: 'desc'
            },
            include: {
                alerts: true
            }
        });

        if (recentWaterData.length > 0) {
            colorLog('green', '\n💧 Recent Water Flow Data:');
            recentWaterData.forEach(data => {
                colorLog('cyan', `   • ${data.macAddress} at ${data.location || 'Unknown Location'}`);
                colorLog('white', `     Flow: ${data.flowRate}L/min, Temp: ${data.temperature}°C, TDS: ${data.tds || 'N/A'}`);
                colorLog('white', `     Alerts: ${data.alerts.length}`);
            });
        }

        // Check role permissions
        const rolePermissions = await prisma.rolePermission.findMany({
            include: {
                role: true,
                permission: true
            }
        });

        if (rolePermissions.length > 0) {
            colorLog('green', '\n🔐 Role Permissions:');
            const roleGroups = rolePermissions.reduce((acc, rp) => {
                if (!acc[rp.role.roleName]) {
                    acc[rp.role.roleName] = [];
                }
                acc[rp.role.roleName].push(rp.permission.permissionName);
                return acc;
            }, {});

            for (const [roleName, permissions] of Object.entries(roleGroups)) {
                colorLog('cyan', `   • ${roleName}: ${permissions.length} permissions`);
                permissions.forEach(permission => {
                    colorLog('white', `     - ${permission}`);
                });
            }
        }

        // Check for potential issues
        colorLog('\n' + colors.yellow + '⚠️  Potential Issues:' + colors.reset);
        colorLog('yellow', '===================');

        let issuesFound = false;

        // Check for users without roles
        const usersWithoutRoles = await prisma.user.count({
            where: {
                roleId: null
            }
        });

        if (usersWithoutRoles > 0) {
            colorLog('red', `   ❌ ${usersWithoutRoles} users without roles`);
            issuesFound = true;
        }

        // Check for products without inventory
        const productsWithoutInventory = await prisma.product.count({
            where: {
                Inventory: {
                    none: {}
                }
            }
        });

        if (productsWithoutInventory > 0) {
            colorLog('red', `   ❌ ${productsWithoutInventory} products without inventory`);
            issuesFound = true;
        }

        // Check for categories without products
        const categoriesWithoutProducts = await prisma.category.count({
            where: {
                products: {
                    none: {}
                }
            }
        });

        if (categoriesWithoutProducts > 0) {
            colorLog('yellow', `   ⚠️  ${categoriesWithoutProducts} categories without products`);
        }

        if (!issuesFound) {
            colorLog('green', '   ✅ No critical issues found!');
        }

        // Summary
        const totalRecords = Object.values(counts).reduce((sum, count) => sum + count, 0);
        colorLog('\n' + colors.green + '✅ Verification Complete!' + colors.reset);
        colorLog('green', `📊 Total records in database: ${totalRecords}`);

        if (totalRecords > 0) {
            colorLog('green', '🎉 Database appears to be properly populated with demo data!');
            colorLog('white', '\n💡 You can now:');
            colorLog('white', '   • Start your application server');
            colorLog('white', '   • Test API endpoints with the demo data');
            colorLog('white', '   • Login with demo user credentials');
            colorLog('white', '   • Explore data with Prisma Studio: npx prisma studio');
        } else {
            colorLog('red', '❌ Database appears to be empty. Consider running the demo data insertion script.');
        }

    } catch (error) {
        colorLog('red', `\n❌ Error during verification: ${error.message}`);
        console.error(error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// Run the verification
verifyData();
