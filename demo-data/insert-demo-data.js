#!/usr/bin/env node

/**
 * Demo Data Insertion Script for AquaSolve IoT
 * 
 * This script provides options to:
 * 1. Insert demo data only
 * 2. Clear existing data and insert demo data
 * 
 * Usage: node demo-data/insert-demo-data.js
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import readline from 'readline';
import { demoData, rolePermissionMappings } from './demo-dataset.js';

const prisma = new PrismaClient();

// Utility function to hash passwords (using same method as auth.hash.password.js)
function hashPassword(password, salt) {
    const hash = crypto.createHmac('sha256', salt);
    hash.update(password);
    return hash.digest('hex');
}

// Utility function to generate random salt
function generateSalt() {
    return crypto.randomBytes(16).toString('hex');
}

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

// Create readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askQuestion(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer);
        });
    });
}

async function clearAllData() {
    colorLog('yellow', '🗑️  Clearing existing data...');

    try {
        // Delete in reverse order of dependencies
        await prisma.alert.deleteMany();
        await prisma.waterFlowData.deleteMany();
        await prisma.dataLogger.deleteMany();
        await prisma.consumer.deleteMany();
        await prisma.order.deleteMany();
        await prisma.purchase.deleteMany();
        await prisma.stockMovement.deleteMany();
        await prisma.inventory.deleteMany();
        await prisma.product.deleteMany();
        await prisma.brand.deleteMany();

        // Recursive deletion of categories
        const deleteCategoriesRecursively = async () => {
            const categories = await prisma.category.findMany({
                where: { parentId: null },
                include: { children: true },
            });

            for (const category of categories) {
                await deleteCategoryAndChildren(category);
            }
        };

        const deleteCategoryAndChildren = async (category) => {
            for (const child of category.children) {
                await deleteCategoryAndChildren(child);
            }
            await prisma.category.delete({ where: { id: category.id } });
        };

        await deleteCategoriesRecursively();

        await prisma.warehouse.deleteMany();
        await prisma.supplier.deleteMany();
        await prisma.rolePermission.deleteMany();
        await prisma.user.deleteMany();
        await prisma.permission.deleteMany();
        await prisma.role.deleteMany();

        colorLog('green', '✅ All existing data cleared successfully!');
    } catch (error) {
        colorLog('red', `❌ Error clearing data: ${error.message}`);
        throw error;
    }
}

async function insertRoles() {
    colorLog('blue', '👥 Inserting roles...');

    const roles = [];
    for (const roleData of demoData.roles) {
        const role = await prisma.role.create({
            data: roleData
        });
        roles.push(role);
        colorLog('cyan', `   ✓ Created role: ${role.roleName}`);
    }

    return roles;
}

async function insertPermissions() {
    colorLog('blue', '🔐 Inserting permissions...');

    const permissions = [];
    for (const permissionData of demoData.permissions) {
        const permission = await prisma.permission.create({
            data: permissionData
        });
        permissions.push(permission);
        colorLog('cyan', `   ✓ Created permission: ${permission.permissionName}`);
    }

    return permissions;
}

async function insertRolePermissions() {
    colorLog('blue', '🔗 Linking roles with permissions...');

    for (const mapping of rolePermissionMappings) {
        const role = await prisma.role.findUnique({
            where: { roleName: mapping.roleName }
        });

        if (!role) {
            colorLog('yellow', `   ⚠️  Role ${mapping.roleName} not found, skipping...`);
            continue;
        }

        for (const permissionName of mapping.permissions) {
            const permission = await prisma.permission.findUnique({
                where: { permissionName }
            });

            if (!permission) {
                colorLog('yellow', `   ⚠️  Permission ${permissionName} not found, skipping...`);
                continue;
            }

            try {
                await prisma.rolePermission.create({
                    data: {
                        roleId: role.id,
                        permissionId: permission.id
                    }
                });
                colorLog('cyan', `   ✓ Linked ${role.roleName} with ${permission.permissionName}`);
            } catch (error) {
                if (error.code === 'P2002') {
                    colorLog('yellow', `   ⚠️  Role-Permission link already exists: ${role.roleName} - ${permission.permissionName}`);
                } else {
                    throw error;
                }
            }
        }
    }
}

async function insertUsers() {
    colorLog('blue', '👤 Inserting users...');

    const users = [];
    for (const userData of demoData.users) {
        const role = await prisma.role.findUnique({
            where: { roleName: userData.roleName }
        });

        if (!role) {
            colorLog('yellow', `   ⚠️  Role ${userData.roleName} not found for user ${userData.username}, skipping...`);
            continue;
        }

        const salt = generateSalt();
        const hashedPassword = hashPassword(userData.password, salt);

        const user = await prisma.user.create({
            data: {
                username: userData.username,
                email: userData.email,
                password: hashedPassword,
                salt: salt,
                firstName: userData.firstName,
                lastName: userData.lastName,
                isActive: userData.isActive,
                roleId: role.id
            }
        });

        users.push(user);
        colorLog('cyan', `   ✓ Created user: ${user.username} (${user.email})`);
    }

    return users;
}

async function insertCategories() {
    colorLog('blue', '📂 Inserting categories...');

    const categories = [];

    // First, create parent categories
    for (const categoryData of demoData.categories.filter(cat => !cat.parentName)) {
        const existingCategory = await prisma.category.findUnique({
            where: { name: categoryData.name }
        });

        if (existingCategory) {
            colorLog('yellow', `   ⚠️  Category ${categoryData.name} already exists, skipping...`);
            continue;
        }

        const category = await prisma.category.create({
            data: {
                name: categoryData.name,
                description: categoryData.description
            }
        });
        categories.push(category);
        colorLog('cyan', `   ✓ Created parent category: ${category.name}`);
    }

    // Then, create child categories
    for (const categoryData of demoData.categories.filter(cat => cat.parentName)) {
        const parent = await prisma.category.findUnique({
            where: { name: categoryData.parentName }
        });

        if (!parent) {
            colorLog('yellow', `   ⚠️  Parent category ${categoryData.parentName} not found, skipping ${categoryData.name}...`);
            continue;
        }

        const existingCategory = await prisma.category.findUnique({
            where: { name: categoryData.name }
        });

        if (existingCategory) {
            colorLog('yellow', `   ⚠️  Category ${categoryData.name} already exists, skipping...`);
            continue;
        }

        const category = await prisma.category.create({
            data: {
                name: categoryData.name,
                description: categoryData.description,
                parentId: parent.id
            }
        });
        categories.push(category);
        colorLog('cyan', `   ✓ Created child category: ${category.name} (parent: ${parent.name})`);
    }

    return categories;
}

async function insertBrands() {
    colorLog('blue', '🏷️  Inserting brands...');

    const brands = [];
    for (const brandData of demoData.brands) {
        const brand = await prisma.brand.create({
            data: brandData
        });
        brands.push(brand);
        colorLog('cyan', `   ✓ Created brand: ${brand.name}`);
    }

    return brands;
}

async function insertProducts() {
    colorLog('blue', '📦 Inserting products...');

    const products = [];
    for (const productData of demoData.products) {
        const category = await prisma.category.findUnique({
            where: { name: productData.categoryName }
        });

        const brand = await prisma.brand.findUnique({
            where: { name: productData.brandName }
        });

        if (!category || !brand) {
            colorLog('yellow', `   ⚠️  Category or Brand not found for product ${productData.name}, skipping...`);
            continue;
        }

        const product = await prisma.product.create({
            data: {
                name: productData.name,
                description: productData.description,
                price: productData.price,
                categoryId: category.id,
                brandId: brand.id,
                variants: productData.variants,
                attributes: productData.attributes,
                metadata: productData.metadata,
                images: productData.images,
                isActive: true
            }
        });

        products.push(product);
        colorLog('cyan', `   ✓ Created product: ${product.name}`);
    }

    return products;
}

async function insertWarehouses() {
    colorLog('blue', '🏭 Inserting warehouses...');

    const warehouses = [];
    for (const warehouseData of demoData.warehouses) {
        const warehouse = await prisma.warehouse.create({
            data: {
                name: warehouseData.name,
                location: warehouseData.location,
                zones: warehouseData.zones,
                metadata: warehouseData.metadata,
                isActive: true
            }
        });

        warehouses.push(warehouse);
        colorLog('cyan', `   ✓ Created warehouse: ${warehouse.name}`);
    }

    return warehouses;
}

async function insertSuppliers() {
    colorLog('blue', '🏪 Inserting suppliers...');

    const suppliers = [];
    for (const supplierData of demoData.suppliers) {
        const supplier = await prisma.supplier.create({
            data: {
                name: supplierData.name,
                email: supplierData.email,
                contacts: supplierData.contacts,
                addresses: supplierData.addresses,
                metadata: supplierData.metadata,
                isActive: true
            }
        });

        suppliers.push(supplier);
        colorLog('cyan', `   ✓ Created supplier: ${supplier.name}`);
    }

    return suppliers;
}

async function insertConsumers() {
    colorLog('blue', '👥 Inserting consumers...');

    const consumers = [];
    for (const consumerData of demoData.consumers) {
        const hashedPassword = hashPassword(consumerData.password, generateSalt());

        const consumer = await prisma.consumer.create({
            data: {
                consumerEmail: consumerData.consumerEmail,
                mobileNo: consumerData.mobileNo,
                password: hashedPassword,
                consumerStatus: consumerData.consumerStatus
            }
        });

        consumers.push(consumer);
        colorLog('cyan', `   ✓ Created consumer: ${consumer.consumerEmail}`);
    }

    return consumers;
}

async function insertDataLoggers() {
    colorLog('blue', '📊 Inserting data loggers...');

    const dataLoggers = [];
    for (const loggerData of demoData.dataLoggers) {
        const logger = await prisma.dataLogger.create({
            data: loggerData
        });

        dataLoggers.push(logger);
        colorLog('cyan', `   ✓ Created data logger: ${logger.macAddress}`);
    }

    return dataLoggers;
}

async function insertWaterFlowData() {
    colorLog('blue', '💧 Inserting water flow data...');

    const waterFlowDataRecords = [];
    for (const flowData of demoData.waterFlowData) {
        const record = await prisma.waterFlowData.create({
            data: flowData
        });

        waterFlowDataRecords.push(record);
        colorLog('cyan', `   ✓ Created water flow record: ${record.macAddress} at ${record.timestamp}`);
    }

    return waterFlowDataRecords;
}

async function insertSampleInventory(products, warehouses) {
    colorLog('blue', '📋 Inserting sample inventory...');

    if (products.length === 0 || warehouses.length === 0) {
        colorLog('yellow', '   ⚠️  No products or warehouses found, skipping inventory creation...');
        return [];
    }

    const inventoryRecords = [];

    // Create inventory for each product in the main warehouse
    const mainWarehouse = warehouses[0];

    for (let i = 0; i < products.length; i++) {
        const product = products[i];
        const inventory = await prisma.inventory.create({
            data: {
                productId: product.id,
                warehouseId: mainWarehouse.id,
                quantity: Math.floor(Math.random() * 100) + 50, // Random quantity between 50-150
                location: {
                    aisle: `A-${Math.floor(Math.random() * 20) + 1}`,
                    rack: `R-${Math.floor(Math.random() * 50) + 1}`,
                    shelf: `S-${Math.floor(Math.random() * 10) + 1}`,
                    zone: "A"
                },
                stockLevels: {
                    available: Math.floor(Math.random() * 80) + 40,
                    reserved: Math.floor(Math.random() * 20) + 5,
                    damaged: Math.floor(Math.random() * 5),
                    thresholds: {
                        reorderPoint: 25,
                        maxStock: 200,
                        minStock: 20,
                        safetyStock: 30
                    }
                }
            }
        });

        inventoryRecords.push(inventory);
        colorLog('cyan', `   ✓ Created inventory for: ${product.name} (Qty: ${inventory.quantity})`);
    }

    return inventoryRecords;
}

async function insertSampleStockMovements(products) {
    colorLog('blue', '📈 Inserting sample stock movements...');

    if (products.length === 0) {
        colorLog('yellow', '   ⚠️  No products found, skipping stock movements...');
        return [];
    }

    // Get a user to use as createdBy (use admin user)
    const adminUser = await prisma.user.findUnique({
        where: { username: 'admin' }
    });

    if (!adminUser) {
        colorLog('yellow', '   ⚠️  Admin user not found, skipping stock movements...');
        return [];
    }

    const stockMovements = [];
    const movementTypes = ['INBOUND', 'OUTBOUND', 'ADJUSTMENT', 'TRANSFER'];

    for (let i = 0; i < 5; i++) {
        const product = products[Math.floor(Math.random() * products.length)];
        const movement = await prisma.stockMovement.create({
            data: {
                type: movementTypes[Math.floor(Math.random() * movementTypes.length)],
                productId: product.id,
                quantity: Math.floor(Math.random() * 50) + 1,
                fromLocation: {
                    warehouseId: "WH001",
                    zone: "A",
                    aisle: "A-12"
                },
                toLocation: {
                    warehouseId: "WH001",
                    zone: "B",
                    aisle: "B-05"
                },
                metadata: {
                    reason: "Stock adjustment",
                    operator: "System"
                },
                reference: `SM-${Date.now()}-${i}`,
                createdBy: adminUser.id
            }
        });

        stockMovements.push(movement);
        colorLog('cyan', `   ✓ Created stock movement: ${movement.type} for ${product.name}`);
    }

    return stockMovements;
}

async function insertSampleAlerts(waterFlowData) {
    colorLog('blue', '🚨 Inserting sample alerts...');

    if (waterFlowData.length === 0) {
        colorLog('yellow', '   ⚠️  No water flow data found, skipping alerts...');
        return [];
    }

    const alerts = [];
    const alertTypes = ['HIGH_FLOW', 'LOW_PRESSURE', 'HIGH_TDS', 'TEMPERATURE_ANOMALY'];
    const severities = ['LOW', 'MEDIUM', 'HIGH'];

    for (let i = 0; i < 3; i++) {
        const flowData = waterFlowData[Math.floor(Math.random() * waterFlowData.length)];
        const alertType = alertTypes[Math.floor(Math.random() * alertTypes.length)];

        const alert = await prisma.alert.create({
            data: {
                type: alertType,
                message: `${alertType.replace('_', ' ')} detected in ${flowData.location}`,
                severity: severities[Math.floor(Math.random() * severities.length)],
                flowDataId: flowData.id,
                isResolved: Math.random() > 0.5
            }
        });

        alerts.push(alert);
        colorLog('cyan', `   ✓ Created alert: ${alert.type} (${alert.severity})`);
    }

    return alerts;
}

async function displaySummary() {
    colorLog('green', '\n📊 Data Insertion Summary:');
    colorLog('green', '========================');

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
        alerts: await prisma.alert.count()
    };

    for (const [table, count] of Object.entries(counts)) {
        colorLog('cyan', `   ${table.padEnd(20)}: ${count} records`);
    }

    colorLog('green', '\n✅ Demo data insertion completed successfully!');
    colorLog('white', '\n📝 Default user credentials:');
    colorLog('white', '   Admin: admin@aquasolve.com / Admin@123');
    colorLog('white', '   Manager: manager1@aquasolve.com / Manager@123');
    colorLog('white', '   Operator: operator1@aquasolve.com / Operator@123');
}

async function main() {
    try {
        colorLog('bright', '🌊 AquaSolve IoT - Demo Data Insertion Script');
        colorLog('bright', '=============================================\n');

        // Ask user for operation choice
        colorLog('yellow', 'Please choose an option:');
        colorLog('white', '1. Insert demo data only (preserve existing data)');
        colorLog('white', '2. Clear existing data and insert demo data (fresh start)');
        colorLog('white', '3. Exit\n');

        const choice = await askQuestion('Enter your choice (1-3): ');

        switch (choice.trim()) {
            case '1':
                colorLog('green', '\n🚀 Starting demo data insertion (preserving existing data)...\n');
                break;
            case '2':
                colorLog('red', '\n⚠️  WARNING: This will delete ALL existing data!');
                const confirm = await askQuestion('Are you sure you want to continue? (yes/no): ');
                if (confirm.toLowerCase() !== 'yes') {
                    colorLog('yellow', '❌ Operation cancelled.');
                    process.exit(0);
                }
                colorLog('green', '\n🚀 Starting fresh data insertion...\n');
                await clearAllData();
                break;
            case '3':
                colorLog('yellow', '👋 Goodbye!');
                process.exit(0);
            default:
                colorLog('red', '❌ Invalid choice. Exiting...');
                process.exit(1);
        }

        // Insert data in correct order
        const roles = await insertRoles();
        const permissions = await insertPermissions();
        await insertRolePermissions();
        const users = await insertUsers();
        const categories = await insertCategories();
        const brands = await insertBrands();
        const products = await insertProducts();
        const warehouses = await insertWarehouses();
        const suppliers = await insertSuppliers();
        const consumers = await insertConsumers();
        const dataLoggers = await insertDataLoggers();
        const waterFlowData = await insertWaterFlowData();
        const inventory = await insertSampleInventory(products, warehouses);
        const stockMovements = await insertSampleStockMovements(products);
        const alerts = await insertSampleAlerts(waterFlowData);

        await displaySummary();

    } catch (error) {
        colorLog('red', `\n❌ Error during data insertion: ${error.message}`);
        console.error(error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
        rl.close();
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    colorLog('yellow', '\n\n🛑 Script interrupted. Cleaning up...');
    await prisma.$disconnect();
    rl.close();
    process.exit(0);
});

// Run the script
main();
