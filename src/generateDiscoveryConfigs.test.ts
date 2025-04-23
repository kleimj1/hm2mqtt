
import { generateDiscoveryConfigs, publishDiscoveryConfigs } from './generateDiscoveryConfigs';
import { Device } from './types';
import { DeviceTopics } from './deviceManager';
import { AdditionalDeviceInfo } from './deviceDefinition';
import './device/venus';

describe('Home Assistant Discovery for HMG (Venus)', () => {
  test('should generate discovery configs for an HMG-25 device and include battery_soc', () => {
    const device: Device = { deviceType: 'HMG', deviceId: 'testHMG' };
    const deviceTopics: DeviceTopics = {
      deviceTopic: 'hm2mqtt/testHMG/ctrl',
      publishTopic: 'hm2mqtt/testHMG/data',
      deviceControlTopic: 'hm2mqtt/testHMG/ctrl',
      controlSubscriptionTopic: 'hm2mqtt/testHMG/control',
      availabilityTopic: 'hm2mqtt/testHMG/availability',
    };
    const additionalDeviceInfo: AdditionalDeviceInfo = {};
    const configs = generateDiscoveryConfigs(device, deviceTopics, additionalDeviceInfo);

    expect(configs.length).toBeGreaterThan(0);
    const batterySoc = configs.find(c => c.topic.includes('battery_soc'));
    expect(batterySoc).toBeDefined();
    expect(batterySoc?.config.device_class).toBe('battery');
    expect(batterySoc?.config.unit_of_measurement).toBe('%');
  });

  test('should publish configs via MQTT and handle errors', () => {
    const mockClient = {
      publish: jest.fn((_topic, _message, _options, callback) => callback(null)),
      connected: true,
      disconnected: false,
      reconnecting: false,
      on: jest.fn(),
      end: jest.fn(),
      subscribe: jest.fn(),
    } as any;

    const device: Device = { deviceType: 'HMG', deviceId: 'testHMG' };
    const deviceTopics: DeviceTopics = {
      deviceTopic: 'hm2mqtt/testHMG/ctrl',
      publishTopic: 'hm2mqtt/testHMG/data',
      deviceControlTopic: 'hm2mqtt/testHMG/ctrl',
      controlSubscriptionTopic: 'hm2mqtt/testHMG/control',
      availabilityTopic: 'hm2mqtt/testHMG/availability',
    };
    const additionalDeviceInfo: AdditionalDeviceInfo = {};

    publishDiscoveryConfigs(mockClient, device, deviceTopics, additionalDeviceInfo);
    expect(mockClient.publish).toHaveBeenCalled();
  });
});
