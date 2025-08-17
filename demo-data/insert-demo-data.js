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


import crypto from 'crypto';
import readline from 'readline';
import prisma from '../src/models/index.model.js';
import { demoData, rolePermissionMappings } from './demo-dataset.js';



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
        try {
            // Check if role already exists
            const existingRole = await prisma.role.findUnique({
                where: { roleName: roleData.roleName }
            });

            if (existingRole) {
                colorLog('yellow', `   ⚠️  Role ${roleData.roleName} already exists, skipping...`);
                roles.push(existingRole);
                continue;
            }

            const role = await prisma.role.create({
                data: roleData
            });
            roles.push(role);
            colorLog('cyan', `   ✓ Created role: ${role.roleName}`);
        } catch (error) {
            colorLog('red', `   ❌ Error creating role ${roleData.roleName}: ${error.message}`);
        }
    }

    return roles;
}

async function insertPermissions() {
    colorLog('blue', '🔐 Inserting permissions...');

    const permissions = [];
    for (const permissionData of demoData.permissions) {
        try {
            // Check if permission already exists
            const existingPermission = await prisma.permission.findUnique({
                where: { permissionName: permissionData.permissionName }
            });

            if (existingPermission) {
                colorLog('yellow', `   ⚠️  Permission ${permissionData.permissionName} already exists, skipping...`);
                permissions.push(existingPermission);
                continue;
            }

            const permission = await prisma.permission.create({
                data: permissionData
            });
            permissions.push(permission);
            colorLog('cyan', `   ✓ Created permission: ${permission.permissionName}`);
        } catch (error) {
            colorLog('red', `   ❌ Error creating permission ${permissionData.permissionName}: ${error.message}`);
        }
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
        try {
            // Check if user already exists
            const existingUser = await prisma.user.findUnique({
                where: { email: userData.email }
            });

            if (existingUser) {
                colorLog('yellow', `   ⚠️  User ${userData.email} already exists, skipping...`);
                users.push(existingUser);
                continue;
            }

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
        } catch (error) {
            colorLog('red', `   ❌ Error creating user ${userData.username}: ${error.message}`);
        }
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
        try {
            // Check if brand already exists
            const existingBrand = await prisma.brand.findUnique({
                where: { name: brandData.name }
            });

            if (existingBrand) {
                colorLog('yellow', `   ⚠️  Brand ${brandData.name} already exists, skipping...`);
                brands.push(existingBrand);
                continue;
            }

            const brand = await prisma.brand.create({
                data: brandData
            });
            brands.push(brand);
            colorLog('cyan', `   ✓ Created brand: ${brand.name}`);
        } catch (error) {
            colorLog('red', `   ❌ Error creating brand ${brandData.name}: ${error.message}`);
        }
    }

    return brands;
}

async function insertProducts() {
    colorLog('blue', '📦 Inserting products...');

    const products = [];
    for (const productData of demoData.products) {
        try {
            // Check if product already exists
            const existingProduct = await prisma.product.findFirst({
                where: { name: productData.name }
            });

            if (existingProduct) {
                colorLog('yellow', `   ⚠️  Product ${productData.name} already exists, skipping...`);
                products.push(existingProduct);
                continue;
            }

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
                    variants: productData.variants || {},
                    attributes: productData.attributes || {},
                    metadata: productData.metadata || {},
                    images: productData.images || [],
                    isActive: true
                }
            });

            products.push(product);
            colorLog('cyan', `   ✓ Created product: ${product.name}`);
        } catch (error) {
            colorLog('red', `   ❌ Error creating product ${productData.name}: ${error.message}`);
        }
    }

    return products;
}

async function insertWarehouses() {
    colorLog('blue', '🏭 Inserting warehouses...');

    const warehouses = [];
    for (const warehouseData of demoData.warehouses) {
        try {
            // Check if warehouse already exists
            const existingWarehouse = await prisma.warehouse.findFirst({
                where: { name: warehouseData.name }
            });

            if (existingWarehouse) {
                colorLog('yellow', `   ⚠️  Warehouse ${warehouseData.name} already exists, skipping...`);
                warehouses.push(existingWarehouse);
                continue;
            }

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
        } catch (error) {
            colorLog('red', `   ❌ Error creating warehouse ${warehouseData.name}: ${error.message}`);
        }
    }

    return warehouses;
}

async function insertSuppliers() {
    colorLog('blue', '🏪 Inserting suppliers...');

    const suppliers = [];
    for (const supplierData of demoData.suppliers) {
        try {
            // Check if supplier already exists
            const existingSupplier = await prisma.supplier.findUnique({
                where: { email: supplierData.email }
            });

            if (existingSupplier) {
                colorLog('yellow', `   ⚠️  Supplier ${supplierData.email} already exists, skipping...`);
                suppliers.push(existingSupplier);
                continue;
            }

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
        } catch (error) {
            colorLog('red', `   ❌ Error creating supplier ${supplierData.name}: ${error.message}`);
        }
    }

    return suppliers;
}

async function insertConsumers() {
    colorLog('blue', '👥 Inserting consumers...');

    const consumers = [];
    for (const consumerData of demoData.consumers) {
        // Check if consumer already exists
        const existingConsumer = await prisma.consumer.findUnique({
            where: { consumerEmail: consumerData.consumerEmail }
        });

        if (existingConsumer) {
            colorLog('yellow', `   ⚠️  Consumer ${consumerData.consumerEmail} already exists, skipping...`);
            consumers.push(existingConsumer);
            continue;
        }

        const salt = generateSalt();
        const hashedPassword = hashPassword(consumerData.password, salt);

        const consumer = await prisma.consumer.create({
            data: {
                consumerEmail: consumerData.consumerEmail,
                mobileNo: consumerData.mobileNo,
                password: hashedPassword,
                // Note: Consumer model doesn't have salt field, unlike User model
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
        try {
            // Check if data logger already exists
            const existingLogger = await prisma.dataLogger.findFirst({
                where: {
                    macAddress: loggerData.macAddress,
                    fileName: loggerData.fileName
                }
            });

            if (existingLogger) {
                colorLog('yellow', `   ⚠️  Data logger ${loggerData.macAddress} with file ${loggerData.fileName} already exists, skipping...`);
                dataLoggers.push(existingLogger);
                continue;
            }

            const logger = await prisma.dataLogger.create({
                data: loggerData
            });

            dataLoggers.push(logger);
            colorLog('cyan', `   ✓ Created data logger: ${logger.macAddress}`);
        } catch (error) {
            colorLog('red', `   ❌ Error creating data logger ${loggerData.macAddress}: ${error.message}`);
        }
    }

    return dataLoggers;
}

async function insertWaterFlowData() {
    colorLog('blue', '💧 Inserting water flow data...');

    const waterFlowDataRecords = [];
    for (const flowData of demoData.waterFlowData) {
        try {
            // Check for duplicate water flow data based on timestamp and macAddress
            const existingFlowData = await prisma.waterFlowData.findFirst({
                where: {
                    macAddress: flowData.macAddress,
                    timestamp: flowData.timestamp
                }
            });

            if (existingFlowData) {
                colorLog('yellow', `   ⚠️  Water flow data for ${flowData.macAddress} at ${flowData.timestamp} already exists, skipping...`);
                waterFlowDataRecords.push(existingFlowData);
                continue;
            }

            const record = await prisma.waterFlowData.create({
                data: {
                    ...flowData,
                    // Ensure all optional fields are properly handled
                    isActive: flowData.isActive ?? true
                }
            });

            waterFlowDataRecords.push(record);
            colorLog('cyan', `   ✓ Created water flow record: ${record.macAddress} at ${record.timestamp}`);
        } catch (error) {
            colorLog('red', `   ❌ Error creating water flow data for ${flowData.macAddress}: ${error.message}`);
        }
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
    const mainWarehouse = warehouses[0];

    for (let i = 0; i < products.length; i++) {
        try {
            const product = products[i];

            // Check if inventory already exists for this product in this warehouse
            const existingInventory = await prisma.inventory.findFirst({
                where: {
                    productId: product.id,
                    warehouseId: mainWarehouse.id
                }
            });

            if (existingInventory) {
                colorLog('yellow', `   ⚠️  Inventory for ${product.name} in ${mainWarehouse.name} already exists, skipping...`);
                inventoryRecords.push(existingInventory);
                continue;
            }

            const baseQuantity = Math.floor(Math.random() * 100) + 50; // Random quantity between 50-150
            const availableStock = Math.floor(baseQuantity * 0.8); // 80% of total stock is available
            const reservedStock = Math.floor(baseQuantity * 0.15); // 15% is reserved
            const damagedStock = Math.floor(baseQuantity * 0.05); // 5% is damaged

            const inventory = await prisma.inventory.create({
                data: {
                    productId: product.id,
                    warehouseId: mainWarehouse.id,
                    quantity: baseQuantity,
                    location: {
                        aisle: `A-${Math.floor(Math.random() * 20) + 1}`,
                        rack: `R-${Math.floor(Math.random() * 50) + 1}`,
                        shelf: `S-${Math.floor(Math.random() * 10) + 1}`,
                        zone: "A",
                        bin: `BIN-${i + 1}`
                    },
                    stockLevels: {
                        available: availableStock,
                        reserved: reservedStock,
                        damaged: damagedStock,
                        total: baseQuantity,
                        thresholds: {
                            reorderPoint: 25,
                            maxStock: 200,
                            minStock: 20,
                            safetyStock: 30
                        },
                        lastUpdated: new Date().toISOString()
                    },
                    customFields: {
                        lastCountDate: new Date().toISOString(),
                        countedBy: "System",
                        notes: "Initial inventory setup"
                    }
                }
            });

            inventoryRecords.push(inventory);
            colorLog('cyan', `   ✓ Created inventory for: ${product.name} (Qty: ${inventory.quantity}, Available: ${availableStock})`);
        } catch (error) {
            colorLog('red', `   ❌ Error creating inventory for ${products[i].name}: ${error.message}`);
        }
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
        try {
            const product = products[Math.floor(Math.random() * products.length)];
            const movementType = movementTypes[Math.floor(Math.random() * movementTypes.length)];

            const movement = await prisma.stockMovement.create({
                data: {
                    type: movementType,
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
                        operator: "System",
                        batchNumber: `BATCH-${Date.now()}-${i}`
                    },
                    reference: `SM-${Date.now()}-${i}`,
                    createdBy: adminUser.id
                }
            });

            stockMovements.push(movement);
            colorLog('cyan', `   ✓ Created stock movement: ${movement.type} for ${product.name} (Qty: ${movement.quantity})`);
        } catch (error) {
            colorLog('red', `   ❌ Error creating stock movement ${i}: ${error.message}`);
        }
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

async function insertSampleOrders(products, consumers) {
    colorLog('blue', '🛒 Inserting sample orders...');

    if (products.length === 0 || consumers.length === 0) {
        colorLog('yellow', '   ⚠️  No products or consumers found, skipping orders...');
        return [];
    }

    const orders = [];
    const orderStatuses = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED'];

    for (let i = 0; i < 5; i++) {
        const product = products[Math.floor(Math.random() * products.length)];
        const consumer = consumers[Math.floor(Math.random() * consumers.length)];
        const quantity = Math.floor(Math.random() * 3) + 1;
        const totalAmount = product.price * quantity;

        const order = await prisma.order.create({
            data: {
                orderNumber: `ORD-${Date.now()}-${i}`,
                customerId: consumer.id,
                status: orderStatuses[Math.floor(Math.random() * orderStatuses.length)],
                productId: product.id,
                itemsInfo: {
                    items: [{
                        productId: product.id,
                        productName: product.name,
                        quantity: quantity,
                        unitPrice: product.price,
                        totalPrice: totalAmount
                    }]
                },
                payment: {
                    method: "CREDIT_CARD",
                    status: "COMPLETED",
                    transactionId: `TXN-${Date.now()}-${i}`
                },
                shipping: {
                    address: "Sample Address, City, State, PIN",
                    method: "STANDARD",
                    trackingNumber: `TRK-${Date.now()}-${i}`
                },
                totalAmount: totalAmount
            }
        });

        orders.push(order);
        colorLog('cyan', `   ✓ Created order: ${order.orderNumber} (${order.status})`);
    }

    return orders;
}

async function insertSamplePurchases(suppliers) {
    colorLog('blue', '🏪 Inserting sample purchases...');

    if (suppliers.length === 0) {
        colorLog('yellow', '   ⚠️  No suppliers found, skipping purchases...');
        return [];
    }

    const purchases = [];
    const purchaseStatuses = ['ORDERED', 'PARTIAL', 'COMPLETED'];

    for (let i = 0; i < 3; i++) {
        const supplier = suppliers[Math.floor(Math.random() * suppliers.length)];
        const totalAmount = Math.floor(Math.random() * 50000) + 10000;

        const purchase = await prisma.purchase.create({
            data: {
                supplierId: supplier.id,
                status: purchaseStatuses[Math.floor(Math.random() * purchaseStatuses.length)],
                items: {
                    purchaseItems: [{
                        itemName: "Water Filter Components",
                        quantity: Math.floor(Math.random() * 100) + 50,
                        unitPrice: 150.00,
                        totalPrice: totalAmount
                    }]
                },
                metadata: {
                    purchaseOrderNumber: `PO-${Date.now()}-${i}`,
                    deliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
                    notes: "Bulk order for Q1 inventory"
                },
                totalAmount: totalAmount
            }
        });

        purchases.push(purchase);
        colorLog('cyan', `   ✓ Created purchase: PO-${Date.now()}-${i} (${purchase.status})`);
    }

    return purchases;
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
        alerts: await prisma.alert.count(),
        orders: await prisma.order.count(),
        purchases: await prisma.purchase.count()
    };

    for (const [table, count] of Object.entries(counts)) {
        const emoji = count > 0 ? '✅' : '❌';
        const color = count > 0 ? 'cyan' : 'yellow';
        colorLog(color, `   ${emoji} ${table.padEnd(20)}: ${count} records`);
    }

    colorLog('green', '\n✅ Demo data insertion completed successfully!');
    colorLog('white', '\n📝 Default user credentials:');
    colorLog('white', '   Admin: admin@aquasolve.com / Admin@123');
    colorLog('white', '   Manager: manager1@aquasolve.com / Manager@123');
    colorLog('white', '   Operator: operator1@aquasolve.com / Operator@123');
    colorLog('white', '   Consumer: customer1@example.com / Customer@123');
}

async function main() {
    try {
        // Test database connection first
        await prisma.$connect();
        colorLog('green', '✅ Database connection successful');

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

        // Insert data in correct order with progress tracking
        colorLog('blue', '\n📊 Starting data insertion process...\n');

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
        const orders = await insertSampleOrders(products, consumers);
        const purchases = await insertSamplePurchases(suppliers);

        await displaySummary();

    } catch (error) {
        colorLog('red', `\n❌ Error during data insertion: ${error.message}`);

        // Log more details in development
        if (process.env.NODE_ENV !== 'production') {
            console.error('Full error details:', error);
        }

        // Attempt graceful cleanup
        try {
            await prisma.$disconnect();
        } catch (disconnectError) {
            colorLog('red', `❌ Error disconnecting from database: ${disconnectError.message}`);
        }

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
