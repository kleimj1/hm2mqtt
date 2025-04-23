import { generateDiscoveryConfigs, publishDiscoveryConfigs } from './generateDiscoveryConfigs';
import { Device } from './types';
import { DeviceTopics } from './deviceManager';
import { AdditionalDeviceInfo } from './deviceDefinition';

describe('Home Assistant Discovery for HMG (Venus)', () => {
  test('should generate discovery configs for an HMG-25 device', () => {
    const deviceType = 'HMG';
    const deviceId = 'testHMG';
    const deviceTopic = `hm2mqtt/${deviceId}/ctrl`;
    const publishTopic = `hm2mqtt/${deviceId}/data`;
    const deviceControlTopic = `hm2mqtt/${deviceId}/ctrl`;
    const controlSubscriptionTopic = `hm2mqtt/${deviceId}/control`;
    const availabilityTopic = `hm2mqtt/${deviceId}/availability`;

    const device: Device = { deviceType, deviceId };
    const deviceTopics: DeviceTopics = {
      deviceTopic,
      deviceControlTopic,
      availabilityTopic,
      controlSubscriptionTopic,
      publishTopic,
    };

    const additionalDeviceInfo: AdditionalDeviceInfo = {};
    const configs = generateDiscoveryConfigs(device, deviceTopics, additionalDeviceInfo);

    expect(configs.length).toBeGreaterThan(0);

    const firstConfig = configs[0];
    expect(firstConfig).toHaveProperty('topic');
    expect(firstConfig).toHaveProperty('config');
    expect(firstConfig.config).toHaveProperty('name');
    expect(firstConfig.config).toHaveProperty('unique_id');
    expect(firstConfig.config).toHaveProperty('state_topic');
    expect(firstConfig.config).toHaveProperty('device');

    expect(firstConfig.config.device).toHaveProperty('ids');
    expect(firstConfig.config.device.ids[0]).toBe(`hame_energy_${deviceId}`);
    expect(firstConfig.config.device.name).toBe(`HAME Energy ${deviceType} ${deviceId}`);
    expect(firstConfig.config.device.model_id).toBe(deviceType);
    expect(firstConfig.config.device.manufacturer).toBe('HAME Energy');

    const topics = configs.map(c => c.topic);
    const uniqueTopics = new Set(topics);
    expect(uniqueTopics.size).toBeGreaterThan(0);

    const batterySocSensor = configs.find(c => c.topic.includes('battery_soc'));
    expect(batterySocSensor).toBeDefined();
    expect(batterySocSensor?.config.device_class).toBe('battery');
    expect(batterySocSensor?.config.unit_of_measurement).toBe('%');
    expect(batterySocSensor?.config.availability?.[1].topic).toBe(availabilityTopic);

    const factoryResetButton = configs.find(c => c.topic.includes('factory_reset'));
    expect(factoryResetButton).toBeDefined();
    expect(factoryResetButton?.config.payload_press).toBe('PRESS');
  });

  test('should publish configs via MQTT and handle errors', () => {
    const mockClient = {
      publish: jest.fn((_topic, _message, _options, callback) => callback(null)),
    };

    publishDiscoveryConfigs(
      mockClient,
      {
        device: { deviceType: 'HMG', deviceId: 'testHMG' },
        publishTopic: `hm2mqtt/testHMG/data`,
        controlTopic: `hm2mqtt/testHMG/control`,
        availabilityTopic: `hm2mqtt/testHMG/availability`
      }
    );

    expect(mockClient.publish).toHaveBeenCalled();

    const mockClientWithError = {
      publish: jest.fn((_topic, _message, _options, callback) => callback(new Error('Test error'))),
    };

    publishDiscoveryConfigs(
      mockClientWithError,
      {
        device: { deviceType: 'HMG', deviceId: 'testHMG' },
        publishTopic: `hm2mqtt/testHMG/data`,
        controlTopic: `hm2mqtt/testHMG/control`,
        availabilityTopic: `hm2mqtt/testHMG/availability`
      }
    );
  });
});
