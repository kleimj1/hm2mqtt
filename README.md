# hm2mqtt

Reads Hame energy storage MQTT data, parses it and exposes it as JSON.

## Overview

hm2mqtt is a bridge application that connects Hame energy storage devices (like the B2500 series and Marstek Venus) to Home Assistant (or other home automation systems) via MQTT. It enables real-time monitoring and control of your system directly from the Home Assistant dashboard.

## Supported Devices

- **B2500 Series**:
  - 1st Gen (no timer support)
  - 2nd & 3rd Gen (with timer support)
- **Marstek Venus (HMG-25)**:
  - via [hame-relay](https://github.com/kleimj1/hame-relay) Mode 2 forwarding

## Prerequisites

- A local MQTT broker (e.g. Mosquitto, HA Add-on)
- Device MQTT support (either enabled via app or Bluetooth)
- Optional: [hame-relay](https://github.com/kleimj1/hame-relay) for cloud-to-local MQTT bridging

## Installation

### Home Assistant Add-on

1. Add this repository:
   [![Add Repository](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fkleimj1%2Fhm2mqtt)
2. Install the **hm2mqtt** add-on
3. Configure and start it

### Docker

```bash
docker run -d --name hm2mqtt \
  -e MQTT_BROKER_URL=mqtt://your-broker:1883 \
  -e DEVICE_0=HMG-25:your-device-mac \
  ghcr.io/kleimj1/hm2mqtt:latest
```

## Configuration

### Environment Variables

| Variable                   | Description                                             | Default                 |
|---------------------------|---------------------------------------------------------|-------------------------|
| `MQTT_BROKER_URL`         | URL to your MQTT broker                                 | `mqtt://localhost:1883` |
| `MQTT_USERNAME`           | MQTT username                                           |                         |
| `MQTT_PASSWORD`           | MQTT password                                           |                         |
| `MQTT_POLLING_INTERVAL`   | Device polling interval (ms)                            | `60000`                 |
| `MQTT_RESPONSE_TIMEOUT`   | Timeout waiting for response from device (ms)           | `15000`                 |
| `DEVICE_n`                | Each device in the format `type:mac`                    |                         |
| `POLL_CELL_DATA`          | Poll cell voltages (B2500 only)                         | `false`                 |
| `POLL_EXTRA_BATTERY_DATA` | Poll additional battery data (B2500 only)               | `false`                 |
| `POLL_CALIBRATION_DATA`   | Poll calibration data (B2500 only)                      | `false`                 |

### Home Assistant Add-on config.yaml

```yaml
version: "1.1.3"
devices:
  - deviceType: "HMG-25"
    deviceId: "abcdef123456"
pollingInterval: 60000
responseTimeout: 30000
enableCellData: false
enableCalibrationData: false
enableExtraBatteryData: false
```

## MQTT Topics

### State Topic

```
hame_energy/{device_type}/device/{device_id}/data
```

### Control Topics

```
hame_energy/{device_type}/control/{device_id}/{command}
```

### Example Commands

```bash
# Refresh state
mosquitto_pub -t "hame_energy/HMG-25/control/abcdef123456/refresh" -m "true"

# Set working mode (Venus)
mosquitto_pub -t "hame_energy/HMG-25/control/abcdef123456/working-mode" -m "automatic"
```

## Development

```bash
npm install
npm run build
npm test
```

## Docker Development

```bash
docker build -t hm2mqtt .
docker run -e MQTT_BROKER_URL=mqtt://localhost:1883 -e DEVICE_0=HMG-25:abcdef123456 hm2mqtt
```

## License

MIT

## Contributing

PRs welcome at https://github.com/kleimj1/hm2mqtt
