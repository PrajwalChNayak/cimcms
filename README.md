# Aqua Solve IoT Dashboard

## 📝 Description
A comprehensive IoT dashboard for monitoring and managing water quality parameters in real-time. This project:
- Provides real-time monitoring of water quality sensors
- Visualizes data through interactive charts and graphs
- Enables remote control of water treatment systems
- Helps maintain water quality standards through automated alerts

## ⚡️ Key Features
- Real-time sensor data monitoring and visualization
- Automated alert system for parameter threshold violations
- Interactive dashboard with customizable widgets
- Historical data analysis and reporting
- User management with role-based access control

## 🚀 Installation

```bash
# Clone the repository
git clone https://github.com/cpballresearch/aqua_solve_iot_dashboard.git
cd aqua_solve_iot_dashboard

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

# Start the development server
npm run dev
```

## ⚙️ Configuration
Configure the application through environment variables:

```env
PORT=3000

DB_CONNECTION=mongodb://localhost:27017/aquasolve
API_KEY=your_api_key
```

## 📊 API Reference

### Sensor Data Endpoints

#### `GET /api/sensors`
- **Purpose**: Retrieve all sensor readings
- **Parameters**: 
  - `timeRange`: Optional time range filter
  - `sensorId`: Optional specific sensor filter
- **Returns**: Array of sensor readings with timestamps

#### `POST /api/alerts`
- **Purpose**: Configure alert thresholds
- **Parameters**:
  - `parameter`: Water quality parameter
  - `threshold`: Alert threshold value
- **Returns**: Alert configuration object

## 📝 License
This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

## 👏 Acknowledgments
- MQTT.js for real-time communication
- Chart.js for data visualization
- MongoDB for data storage
- Express.js for the backend framework

## 📞 Contact
- Development Team - support@aquasolve.com
- Project Link: https://github.com/cpballresearch/aqua_solve_iot_dashboard

## 🗺️ Roadmap
- [x] Basic sensor data visualization
- [x] Real-time monitoring system
- [ ] Mobile application integration
- [ ] Advanced analytics dashboard
- [ ] Machine learning predictions

## ❗️ Known Issues
- Dashboard may experience slight delay with high-frequency sensor updates
- Historical data export limited to 30 days
- Mobile view optimization in progress

## 📈 Version History
- 1.0.0
  - Initial production release
  - Basic monitoring features
  - Alert system
- 0.9.0
  - Beta release
  - Core functionality testing
  - User feedback implementation