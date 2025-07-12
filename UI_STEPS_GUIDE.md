# AquaSolve IoT - UI Steps Guide

This document provides comprehensive UI steps and user flows for the AquaSolve IoT application based on the available APIs.

## 🔐 Authentication Flow

### 1. Login Page (Admin/Manager/Operator)

**API:** `POST /login`

**UI Steps:**

1. **Login Form**

   - Email field (required)
   - Password field (required, masked)
   - "Remember me" checkbox
   - "Login" button
   - "Forgot Password?" link

2. **Request Body:**

   ```json
   {
     "email": "admin@aquasolve.com",
     "password": "Admin@123"
   }
   ```

3. **Success Response Handling:**

   - Store JWT token in localStorage/sessionStorage
   - Redirect to dashboard based on user role
   - Show welcome toast message

4. **Error Handling:**
   - Show error message for invalid credentials
   - Show validation errors for empty fields
   - Rate limiting message if too many attempts

### 2. Consumer Registration & Login

**APIs:** `POST /consumer/register`, `POST /consumer/login`

**Registration UI Steps:**

1. **Registration Form**

   - Email field (required, email validation)
   - Mobile number field (required, phone validation)
   - Password field (required, strength indicator)
   - Confirm password field (required, match validation)
   - Terms & conditions checkbox
   - "Create Account" button

2. **Request Body:**
   ```json
   {
     "consumerEmail": "customer@example.com",
     "mobileNo": "+91-9876543240",
     "password": "Customer@123",
     "consumerStatus": "ACTIVE"
   }
   ```

**Consumer Login UI Steps:**

1. **Consumer Login Form**
   - Email/Mobile field (required)
   - Password field (required, masked)
   - "Login" button
   - "Register" link for new users

## 📊 Dashboard Views

### 1. Admin Dashboard

**Landing Page After Login:**

1. **Header Navigation**

   - AquaSolve logo
   - User avatar with dropdown (Profile, Settings, Logout)
   - Notifications bell icon
   - Search bar

2. **Sidebar Navigation**

   - Dashboard (active)
   - User Management
   - Role & Permissions
   - Water Flow Monitoring
   - Data Loggers
   - Consumer Management
   - Reports & Analytics

3. **Main Dashboard Content**
   - Key metrics cards (Total Users, Active Sensors, Water Quality Alerts)
   - Recent water flow data chart
   - System status indicators
   - Quick action buttons

### 2. Manager Dashboard

**Similar to Admin but with restricted access:**

- No delete user capabilities
- Limited permission management
- Full access to water flow data and inventory

### 3. Operator Dashboard

**Read-only dashboard:**

- View water flow data
- Monitor sensor status
- View inventory levels
- No create/edit capabilities

## 👥 User Management

### 1. User List Page

**API:** `GET /user`

**UI Steps:**

1. **Page Header**

   - "User Management" title
   - "Add New User" button (Admin/Manager only)
   - Search and filter controls

2. **Users Table**

   - Columns: Name, Email, Role, Status, Last Login, Actions
   - Pagination controls
   - Bulk actions dropdown

3. **Filter Options**
   - Role filter dropdown
   - Status filter (Active/Inactive)
   - Date range picker for last login

### 2. Create User Modal/Page

**API:** `POST /user`

**UI Steps:**

1. **User Form**

   - First Name (required)
   - Last Name (required)
   - Email (required, unique validation)
   - Username (required, unique validation)
   - Password (required, strength meter)
   - Role dropdown (required)
   - Status toggle (Active/Inactive)
   - "Save" and "Cancel" buttons

2. **Request Body:**
   ```json
   {
     "firstName": "John",
     "lastName": "Doe",
     "email": "john.doe@aquasolve.com",
     "username": "johndoe",
     "password": "SecurePass@123",
     "roleId": "role_id_here",
     "isActive": true
   }
   ```

### 3. Edit User

**APIs:** `GET /user/:id`, `PUT /user/:id`

**UI Steps:**

1. Load user data with GET request
2. Pre-populate form fields
3. Allow editing (password field optional)
4. Show confirmation dialog before saving changes

## 🔑 Role & Permission Management

### 1. Roles List Page

**API:** `GET /role`

**UI Steps:**

1. **Page Layout**

   - "Roles & Permissions" title
   - "Create Role" button
   - Roles grid/table view

2. **Role Cards**
   - Role name and description
   - Permission count
   - User count with this role
   - Edit/Delete actions

### 2. Create/Edit Role

**APIs:** `POST /role`, `PUT /role/:id`

**UI Steps:**

1. **Role Form**

   - Role Name (required)
   - Description (optional)
   - "Save" button

2. **Permission Assignment**
   - Checkboxes for all available permissions
   - Group permissions by category
   - "Select All" / "Deselect All" options

### 3. Permission Management

**API:** `GET /permission`

**UI Steps:**

1. **Permissions Grid**
   - Permission name
   - Description
   - Category grouping
   - Usage count (how many roles have this permission)

## 💧 Water Flow Monitoring

### 1. Water Flow Dashboard

**API:** `GET /water-flow`

**UI Steps:**

1. **Real-time Metrics Cards**

   - Current flow rate
   - Total daily consumption
   - Average temperature
   - Water quality status

2. **Device Status Grid**

   - Each device card showing:
     - MAC address
     - Location
     - Status (Online/Offline)
     - Last reading timestamp
     - Quick stats

3. **Charts Section**
   - Flow rate over time (line chart)
   - Daily consumption (bar chart)
   - Temperature trends
   - Water quality parameters

### 2. Device Detail View

**APIs:** `GET /water-flow/device/:macAddress`, `GET /water-flow/analytics/:macAddress/:timeframe`

**UI Steps:**

1. **Device Header**

   - Device name/MAC address
   - Location
   - Status indicator
   - Last update time

2. **Analytics Tabs**

   - **Overview:** Key metrics and current readings
   - **Flow Data:** Detailed flow rate charts
   - **Water Quality:** pH, TDS, turbidity trends
   - **Alerts:** Device-specific alerts and notifications

3. **Time Range Selector**
   - Predefined ranges: 1 hour, 6 hours, 24 hours, 7 days, 30 days
   - Custom date range picker

### 3. Add Sensor Reading (For IoT devices)

**API:** `POST /sensor`

**UI Steps (Admin Interface):**

1. **Manual Reading Form**
   - MAC Address dropdown (from registered devices)
   - Timestamp picker
   - Flow Rate input
   - Temperature input
   - Water quality parameters (pH, TDS, etc.)
   - Location field
   - "Submit Reading" button

## 📁 Data Logger Management

### 1. Data Logger Upload

**API:** `POST /datalogger/storeData`

**UI Steps:**

1. **File Upload Interface**

   - Drag & drop area for CSV files
   - File browser button
   - Upload progress bar
   - File validation (CSV format, size limits)

2. **Upload Form**

   - MAC Address field
   - Date picker
   - File input
   - "Upload Data" button

3. **Upload Status**
   - Processing indicator
   - Success/error messages
   - Data preview after successful upload

## 👥 Consumer Management

### 1. Consumer List

**API:** `GET /consumer` (if available)

**UI Steps:**

1. **Consumer Table**

   - Email, Mobile, Status, Registration Date
   - Search and filter capabilities
   - Export to CSV option

2. **Consumer Actions**
   - View profile
   - Activate/Deactivate account
   - Send notifications

### 2. Consumer Dashboard (Consumer Portal)

**After consumer login:**

**UI Steps:**

1. **Consumer Dashboard**

   - Personal water consumption metrics
   - Device status (if linked)
   - Monthly reports
   - Water quality alerts

2. **My Devices Section**
   - Linked IoT devices
   - Real-time readings
   - Historical data charts

## 📱 Mobile-Responsive Considerations

### 1. Mobile Navigation

- Collapsible sidebar menu
- Bottom navigation for key sections
- Swipe gestures for charts

### 2. Mobile Dashboard

- Stacked metric cards
- Simplified charts
- Touch-friendly buttons and inputs

## 🎨 UI/UX Best Practices

### 1. Color Coding

- **Blue:** Primary actions, water-related data
- **Green:** Success states, good water quality
- **Orange:** Warnings, moderate alerts
- **Red:** Errors, critical alerts
- **Gray:** Inactive states, secondary information

### 2. Loading States

- Skeleton loaders for data tables
- Progress indicators for file uploads
- Spinner for API calls

### 3. Error Handling

- Toast notifications for temporary messages
- Inline validation for forms
- Error boundaries for component failures

### 4. Accessibility

- Keyboard navigation support
- Screen reader compatibility
- High contrast mode support
- Focus indicators

## 🔄 Real-time Features

### 1. WebSocket Integration

- Real-time sensor data updates
- Live alerts and notifications
- Device status changes

### 2. Auto-refresh

- Dashboard metrics refresh every 30 seconds
- Chart data updates every minute
- Device status polling

## 📊 Charts and Visualizations

### 1. Chart Types

- **Line Charts:** Flow rate over time, temperature trends
- **Bar Charts:** Daily/monthly consumption
- **Gauge Charts:** Current pressure, flow rate
- **Heat Maps:** Sensor location performance
- **Pie Charts:** Water quality distribution

### 2. Chart Interactions

- Zoom and pan capabilities
- Data point tooltips
- Export chart as image/PDF
- Real-time data streaming

## 🔍 Search and Filters

### 1. Global Search

- Search across users, devices, locations
- Auto-complete suggestions
- Recent searches

### 2. Advanced Filters

- Date range pickers
- Multi-select dropdowns
- Numeric range sliders
- Clear all filters option

This guide provides a comprehensive foundation for building the AquaSolve IoT frontend application. Each section can be expanded with specific component designs and detailed user interactions based on your frontend framework choice (React, Vue, Angular, etc.).
