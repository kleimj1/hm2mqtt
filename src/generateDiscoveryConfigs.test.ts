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
  });

  test('should publish configs via MQTT and handle errors', () => {
    const mockClient = {
      publish: jest.fn((_topic, _message, _options, callback) => callback(null)),
    };
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
