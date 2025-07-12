// Demo dataset for AquaSolve IoT project
export const demoData = {
    // Roles
    roles: [
        {
            roleName: "Admin",
            description: "Full system access and administration privileges"
        },
        {
            roleName: "Manager",
            description: "Inventory and user management privileges"
        },
        {
            roleName: "Operator",
            description: "Basic operations and data viewing privileges"
        },
        {
            roleName: "Customer",
            description: "Customer portal access"
        }
    ],

    // Permissions
    permissions: [
        {
            permissionName: "READ_USERS",
            description: "View user information"
        },
        {
            permissionName: "WRITE_USERS",
            description: "Create and modify users"
        },
        {
            permissionName: "DELETE_USERS",
            description: "Delete users"
        },
        {
            permissionName: "READ_INVENTORY",
            description: "View inventory data"
        },
        {
            permissionName: "WRITE_INVENTORY",
            description: "Modify inventory data"
        },
        {
            permissionName: "READ_WATER_DATA",
            description: "View water flow data"
        },
        {
            permissionName: "WRITE_WATER_DATA",
            description: "Modify water flow data"
        },
        {
            permissionName: "MANAGE_ORDERS",
            description: "Manage orders and transactions"
        }
    ],

    // Users (passwords will be hashed in the script)
    users: [
        {
            username: "admin",
            email: "admin@aquasolve.com",
            password: "Admin@123",

            firstName: "System",
            lastName: "Administrator",
            isActive: true,
            roleName: "Admin"
        },
        {
            username: "manager1",
            email: "manager1@aquasolve.com",
            password: "Manager@123",

            firstName: "John",
            lastName: "Manager",
            isActive: true,
            roleName: "Manager"
        },
        {
            username: "operator1",
            email: "operator1@aquasolve.com",
            password: "Operator@123",

            firstName: "Jane",
            lastName: "Operator",
            isActive: true,
            roleName: "Operator"
        }
    ],

    // Categories
    categories: [
        {
            name: "Water Purifiers",
            description: "Water purification systems and devices"
        },
        {
            name: "RO Systems",
            description: "Reverse Osmosis water purification systems",
            parentName: "Water Purifiers"
        },
        {
            name: "UV Systems",
            description: "Ultraviolet water purification systems",
            parentName: "Water Purifiers"
        },
        {
            name: "Filters",
            description: "Water filters and cartridges"
        },
        {
            name: "Sediment Filters",
            description: "Sediment and pre-filters",
            parentName: "Filters"
        },
        {
            name: "Carbon Filters",
            description: "Activated carbon filters",
            parentName: "Filters"
        },
        {
            name: "IoT Devices",
            description: "Smart monitoring and control devices"
        }
    ],

    // Brands
    brands: [
        {
            name: "AquaSolve",
            description: "Premium water purification solutions"
        },
        {
            name: "PureFlow",
            description: "Advanced filtration technology"
        },
        {
            name: "ClearWater",
            description: "Affordable water treatment solutions"
        },
        {
            name: "SmartAqua",
            description: "IoT-enabled water management systems"
        }
    ],

    // Products
    products: [
        {
            name: "AquaSolve Pro RO System",
            description: "Professional grade RO water purification system with 7-stage filtration",
            price: 15999.99,
            categoryName: "RO Systems",
            brandName: "AquaSolve",
            variants: {
                models: [
                    {
                        id: "AS-PRO-100",
                        name: "Pro 100",
                        capacity: "100L/day",
                        color: "White",
                        price: 15999.99,
                        sku: "AS-PRO-100-WHT"
                    },
                    {
                        id: "AS-PRO-200",
                        name: "Pro 200",
                        capacity: "200L/day",
                        color: ["White", "Silver"],
                        price: 22999.99,
                        sku: "AS-PRO-200-MLT"
                    }
                ]
            },
            attributes: {
                technical: {
                    purificationStages: 7,
                    filterType: "RO+UV+UF+TDS",
                    powerConsumption: "24W",
                    dimensions: {
                        height: 45,
                        width: 35,
                        depth: 20,
                        unit: "cm"
                    }
                },
                certifications: ["ISO 9001:2015", "NSF/ANSI 58", "BIS Certified"]
            },
            metadata: {
                warranty: "2 years",
                installation: "Free",
                maintenance: "Annual service included"
            },
            images: ["as-pro-front.jpg", "as-pro-side.jpg", "as-pro-installation.jpg"]
        },
        {
            name: "PureFlow UV Sterilizer",
            description: "High-efficiency UV water sterilization system",
            price: 8999.99,
            categoryName: "UV Systems",
            brandName: "PureFlow",
            variants: {
                models: [
                    {
                        id: "PF-UV-55",
                        name: "UV-55",
                        capacity: "55W",
                        flowRate: "12L/min",
                        price: 8999.99,
                        sku: "PF-UV-55-STD"
                    }
                ]
            },
            attributes: {
                technical: {
                    uvIntensity: "30000 µWs/cm²",
                    lampLife: "9000 hours",
                    maxFlowRate: "12L/min"
                }
            },
            images: ["pf-uv-main.jpg"]
        },
        {
            name: "SmartAqua IoT Monitor",
            description: "Smart water quality monitoring device with IoT connectivity",
            price: 12999.99,
            categoryName: "IoT Devices",
            brandName: "SmartAqua",
            variants: {
                models: [
                    {
                        id: "SA-IOT-001",
                        name: "IoT Monitor Pro",
                        connectivity: ["WiFi", "4G", "Bluetooth"],
                        sensors: ["TDS", "pH", "Temperature", "Flow"],
                        price: 12999.99,
                        sku: "SA-IOT-001-PRO"
                    }
                ]
            },
            attributes: {
                technical: {
                    sensors: ["TDS", "pH", "Temperature", "Turbidity", "Flow Rate"],
                    connectivity: "WiFi/4G/Bluetooth",
                    batteryLife: "30 days",
                    waterproof: "IP68"
                }
            },
            images: ["sa-iot-device.jpg", "sa-iot-app.jpg"]
        }
    ],

    // Warehouses
    warehouses: [
        {
            name: "Main Warehouse Delhi",
            location: {
                address: "Plot 123, Industrial Area, Gurgaon, Delhi",
                coordinates: {
                    lat: 28.4595,
                    lng: 77.0266
                },
                zones: ["A", "B", "C", "D"]
            },
            zones: {
                "A": "RO Systems Storage",
                "B": "Filters and Parts",
                "C": "IoT Devices",
                "D": "Packaging and Dispatch"
            },
            metadata: {
                capacity: "10000 sq ft",
                manager: "Raj Kumar",
                contact: "+91-9876543210"
            }
        },
        {
            name: "Regional Warehouse Mumbai",
            location: {
                address: "Warehouse Complex, Thane, Mumbai",
                coordinates: {
                    lat: 19.2183,
                    lng: 72.9781
                },
                zones: ["A", "B"]
            },
            zones: {
                "A": "Fast Moving Items",
                "B": "Bulk Storage"
            },
            metadata: {
                capacity: "5000 sq ft",
                manager: "Priya Sharma",
                contact: "+91-9876543211"
            }
        }
    ],

    // Suppliers
    suppliers: [
        {
            name: "TechFlow Industries",
            email: "supply@techflow.com",
            contacts: {
                primary: "+91-9876543220",
                secondary: "+91-9876543221",
                whatsapp: "+91-9876543220"
            },
            addresses: {
                office: "Tech Park, Bangalore, Karnataka",
                warehouse: "Industrial Zone, Hosur, Tamil Nadu"
            },
            metadata: {
                rating: 4.5,
                paymentTerms: "30 days",
                deliveryTime: "7-10 days"
            }
        },
        {
            name: "AquaTech Components",
            email: "orders@aquatech.com",
            contacts: {
                primary: "+91-9876543230",
                sales: "+91-9876543231"
            },
            addresses: {
                office: "Industrial Area, Pune, Maharashtra"
            },
            metadata: {
                rating: 4.2,
                paymentTerms: "45 days",
                specialization: "RO Membranes and Filters"
            }
        }
    ],

    // Consumers
    consumers: [
        {
            consumerEmail: "customer1@example.com",
            mobileNo: "+91-9876543240",
            password: "Customer@123",
            consumerStatus: "ACTIVE"
        },
        {
            consumerEmail: "customer2@example.com",
            mobileNo: "+91-9876543241",
            password: "Customer@123",
            consumerStatus: "ACTIVE"
        },
        {
            consumerEmail: "customer3@example.com",
            mobileNo: "+91-9876543242",
            password: "Customer@123",
            consumerStatus: "INACTIVE"
        }
    ],

    // Data Loggers
    dataLoggers: [
        {
            macAddress: "AA:BB:CC:DD:EE:01",
            date: new Date("2024-01-15"),
            fileName: "water_data_20240115.csv"
        },
        {
            macAddress: "AA:BB:CC:DD:EE:02",
            date: new Date("2024-01-16"),
            fileName: "water_data_20240116.csv"
        },
        {
            macAddress: "AA:BB:CC:DD:EE:03",
            date: new Date("2024-01-17"),
            fileName: "water_data_20240117.csv"
        }
    ],

    // Water Flow Data
    waterFlowData: [
        {
            timestamp: new Date("2024-06-30T08:00:00Z"),
            flowRate: 12.5,
            totalLiters: 150.0,
            temperature: 22.5,
            humidity: 65.0,
            macAddress: "AA:BB:CC:DD:EE:01",
            location: "Kitchen - Main Line",
            pressure: 2.5,
            pH: 7.2,
            tds: 120.0,
            conductivity: 180.0,
            turbidity: 0.5
        },
        {
            timestamp: new Date("2024-06-30T09:00:00Z"),
            flowRate: 15.2,
            totalLiters: 165.2,
            temperature: 23.1,
            humidity: 64.5,
            macAddress: "AA:BB:CC:DD:EE:01",
            location: "Kitchen - Main Line",
            pressure: 2.6,
            pH: 7.1,
            tds: 115.0,
            conductivity: 175.0,
            turbidity: 0.4
        },
        {
            timestamp: new Date("2024-06-30T08:30:00Z"),
            flowRate: 8.9,
            totalLiters: 89.5,
            temperature: 21.8,
            humidity: 68.0,
            macAddress: "AA:BB:CC:DD:EE:02",
            location: "Bathroom - Secondary Line",
            pressure: 2.2,
            pH: 7.0,
            tds: 135.0,
            conductivity: 195.0,
            turbidity: 0.7
        }
    ]
};

// Role-Permission mappings
export const rolePermissionMappings = [
    // Admin gets all permissions
    {
        roleName: "Admin",
        permissions: [
            "READ_USERS", "WRITE_USERS", "DELETE_USERS",
            "READ_INVENTORY", "WRITE_INVENTORY",
            "READ_WATER_DATA", "WRITE_WATER_DATA",
            "MANAGE_ORDERS"
        ]
    },
    // Manager gets most permissions except delete users
    {
        roleName: "Manager",
        permissions: [
            "READ_USERS", "WRITE_USERS",
            "READ_INVENTORY", "WRITE_INVENTORY",
            "READ_WATER_DATA", "WRITE_WATER_DATA",
            "MANAGE_ORDERS"
        ]
    },
    // Operator gets read permissions and basic operations
    {
        roleName: "Operator",
        permissions: [
            "READ_USERS", "READ_INVENTORY", "READ_WATER_DATA"
        ]
    },
    // Customer gets limited permissions
    {
        roleName: "Customer",
        permissions: [
            "READ_WATER_DATA"
        ]
    }
];
