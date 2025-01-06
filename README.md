# Aqua Solve IoT

## 📝 Description
Aqua Solve IoT is an Arduino-based smart water quality monitoring system designed for aquaculture environments. It combines affordable sensors with cloud connectivity to provide real-time monitoring and automated alerts.

## ⚡️ Key Features
- Real-time monitoring of:
  - pH levels (0-14 range)
  - Water temperature (0-50°C)
  - TDS (Total Dissolved Solids)
  - Turbidity
- Arduino-based sensor integration
- Web dashboard for data visualization
- SMS and email alerts for critical conditions
- Historical data logging

## 🚀 Installation

```bash
# Clone the repository
git clone https://github.com/cpballresearch/aqua_solve_iot.git
cd aqua_solve_iot

# Arduino Setup
npm install 

npm run generate:prisma
```

## ⚙️ Hardware Requirements
- Arduino Uno/ESP8266
- pH Sensor Module
- DS18B20 Temperature Sensor
- TDS Sensor
- Turbidity Sensor
- LCD Display (16x2)

## 💻 Configuration
Update `config.h` with your settings:

```cpp
#define WIFI_SSID "your_ssid"
#define WIFI_PASSWORD "your_password"
#define ALERT_PHONE "+1234567890"

const float pH_THRESHOLD_MIN = 6.0;
const float pH_THRESHOLD_MAX = 8.0;
const float TEMP_THRESHOLD = 30.0;
```

## 🧪 Testing
Run the test suite:

```bash
npm test
```

## 🤝 Contributing
1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License
This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

## 📞 Contact
- Developer:  CPB
- Email: cpb@gmail.com
- Project Link: https://github.com/cpballresearch/aqua_solve_iot.git

## 🗺️ Roadmap
- [x] Basic sensor integration
- [x] Web dashboard
- [ ] Mobile app development
- [ ] LoRa connectivity support
- [ ] AI-based prediction system

## ❗️ Known Issues
- pH sensor requires weekly calibration
- Web dashboard may need refresh for real-time updates

## 📈 Version History
- 0.1.2
  - Implemented SMS alerts
- 0.0.1
  - Initial prototype
  - Basic pH and temperature monitoring