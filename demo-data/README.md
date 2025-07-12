# AquaSolve IoT - Demo Data Setup

This directory contains demo data and scripts to populate your AquaSolve IoT database with sample data for testing and development purposes.

## 📁 Files Overview

- `demo-dataset.js` - Contains all the demo data definitions
- `insert-demo-data.js` - Main script to insert data into the database
- `README.md` - This documentation file

## 🚀 Quick Start

### Prerequisites

1. Make sure your MongoDB database is running and accessible
2. Ensure your `.env` file has the correct `DATABASE_URL`
3. Generate Prisma client: `npm run prisma:generate`

### Running the Demo Data Script

You have several options to run the demo data insertion:

#### Option 1: Using npm scripts (Recommended)

```bash
# Generate Prisma client and insert demo data
npm run demo:setup

# Or just insert demo data (if Prisma client is already generated)
npm run demo:insert
```

#### Option 2: Direct execution

```bash
# Navigate to project root and run
node demo-data/insert-demo-data.js
```

### 🔧 Interactive Options

When you run the script, you'll be presented with these choices:

1. **Insert demo data only** - Adds demo data while preserving any existing data
2. **Clear existing data and insert demo data** - Completely fresh start (⚠️ **DESTRUCTIVE**)
3. **Exit** - Cancel the operation

## 📊 Demo Data Overview

The script will create the following data:

### 👥 Users & Permissions

- **4 Roles**: Admin, Manager, Operator, Customer
- **8 Permissions**: Various read/write permissions for different modules
- **3 Sample Users** with different role assignments

### 🏷️ Product Catalog

- **4 Brands**: AquaSolve, PureFlow, ClearWater, SmartAqua
- **7 Categories**: Hierarchical structure with water purifiers, filters, IoT devices
- **3 Products**: Complete product information with variants and attributes

### 🏭 Inventory Management

- **2 Warehouses**: Main warehouse in Delhi and regional in Mumbai
- **2 Suppliers**: With complete contact and metadata
- **Sample Inventory**: Auto-generated inventory for all products
- **Stock Movements**: Sample stock movement records

### 💧 IoT Data

- **3 Data Loggers**: MAC address-based device registration
- **3 Water Flow Records**: Realistic water quality and flow data
- **3 Sample Alerts**: Various alert types and severities

### 👥 Customer Data

- **3 Consumer Accounts**: Sample customer registrations

## 🔐 Default Login Credentials

After running the script, you can use these credentials:

| Role     | Email                   | Password     |
| -------- | ----------------------- | ------------ |
| Admin    | admin@aquasolve.com     | Admin@123    |
| Manager  | manager1@aquasolve.com  | Manager@123  |
| Operator | operator1@aquasolve.com | Operator@123 |

## 📋 Data Structure Examples

### Product Variants

```json
{
  "models": [
    {
      "id": "AS-PRO-100",
      "name": "Pro 100",
      "capacity": "100L/day",
      "color": "White",
      "price": 15999.99,
      "sku": "AS-PRO-100-WHT"
    }
  ]
}
```

### Water Flow Data

```json
{
  "timestamp": "2024-06-30T08:00:00Z",
  "flowRate": 12.5,
  "totalLiters": 150.0,
  "temperature": 22.5,
  "humidity": 65.0,
  "macAddress": "AA:BB:CC:DD:EE:01",
  "location": "Kitchen - Main Line",
  "pressure": 2.5,
  "pH": 7.2,
  "tds": 120.0
}
```

### Inventory Location

```json
{
  "aisle": "A-12",
  "rack": "R-45",
  "shelf": "S-3",
  "zone": "A"
}
```

## ⚠️ Important Notes

### Data Relationships

The script maintains proper relationships between:

- Users ↔ Roles ↔ Permissions
- Products ↔ Categories ↔ Brands
- Inventory ↔ Products ↔ Warehouses
- Water Flow Data ↔ Alerts
- Orders ↔ Products

### Password Security

- All user passwords are properly hashed using PBKDF2
- Random salts are generated for each user
- Original passwords are available in the table above for testing

### Error Handling

- The script handles duplicate entries gracefully
- Missing relationships are logged as warnings
- Failed insertions don't stop the entire process

## 🔧 Customization

### Adding More Data

To add more demo data, edit `demo-dataset.js`:

```javascript
// Add to existing arrays
demoData.products.push({
  name: "New Product",
  description: "Product description",
  // ... other fields
});

// Add new data categories
demoData.newCategory = [
  // ... your data
];
```

### Modifying Relationships

Update `rolePermissionMappings` in `demo-dataset.js` to change role-permission assignments:

```javascript
{
  roleName: "CustomRole",
  permissions: ["PERMISSION1", "PERMISSION2"]
}
```

## 🐛 Troubleshooting

### Common Issues

1. **"Database connection failed"**

   - Check your `DATABASE_URL` in `.env`
   - Ensure MongoDB is running

2. **"Prisma client not generated"**

   - Run `npm run prisma:generate`

3. **"Unique constraint violation"**

   - Use option 2 to clear existing data first
   - Or modify demo data to use unique values

4. **"Permission denied"**
   - Make sure the script has execution permissions: `chmod +x demo-data/insert-demo-data.js`

### Debug Mode

To see more detailed output, you can modify the script to show Prisma logs:

```javascript
const prisma = new PrismaClient({
  log: ["query", "info", "warn", "error"],
});
```

## 📈 Performance

- The script typically takes 30-60 seconds to complete
- Large datasets may take longer
- Use option 2 (clear + insert) for fastest execution on populated databases

## 🧪 Testing

After running the demo data script, you can verify the data by:

1. Using Prisma Studio: `npx prisma studio`
2. Checking your API endpoints with the created data
3. Logging in with the default user credentials

## 📝 License

This demo data is provided as-is for development and testing purposes only.
