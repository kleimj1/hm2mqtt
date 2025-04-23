import { ControlHandler } from './controlHandler';
import { DeviceManager } from './deviceManager';
import { Device, MqttConfig, VenusDeviceData } from './types';
import './device/venus';

describe('ControlHandler for HMG (Venus)', () => {
  let controlHandler: ControlHandler;
  let deviceManager: DeviceManager;
  let publishCallback: jest.Mock;
  let testDeviceV1: Device;
  let deviceState: VenusDeviceData;

  beforeEach(() => {
    testDeviceV1 = {
      deviceType: 'HMG',
      deviceId: 'testdeviceV1',
    };

    const config: MqttConfig = {
      brokerUrl: 'mqtt://test.mosquitto.org',
      clientId: 'test-client',
      devices: [testDeviceV1],
      responseTimeout: 15000,
    };

    const onUpdateState = jest.fn();
    deviceManager = new DeviceManager(config, onUpdateState);
    publishCallback = jest.fn();
    controlHandler = new ControlHandler(deviceManager, publishCallback);

    deviceState = {
      deviceType: 'HMG',
      deviceId: 'testdeviceV1',
      timestamp: new Date().toISOString(),
      values: {},
      bms: {
        bms_soc: 70,
        bms_voltage: 5200,
      },
      batterySoc: 70,
      combinedPower: 1500,
      workingStatus: 'charging',
    };

    const key = `${testDeviceV1.deviceType}:${testDeviceV1.deviceId}`;
    deviceManager['deviceStates'][key] = { data: deviceState };
    deviceManager['deviceTopics'][key] = {
      deviceTopic: `hm2mqtt/${testDeviceV1.deviceId}`,
      deviceControlTopic: `hm2mqtt/${testDeviceV1.deviceId}/ctrl`,
      controlSubscriptionTopic: `hm2mqtt/${testDeviceV1.deviceId}/control`,
      availabilityTopic: `hm2mqtt/${testDeviceV1.deviceId}/availability`,
      publishTopic: `hm2mqtt/${testDeviceV1.deviceId}/data`,
    };
  });

  it('should handle known control topic', () => {
    const topic = `hm2mqtt/${testDeviceV1.deviceId}/control/refresh`;
    const message = 'PRESS';
    controlHandler.handleControlTopic(testDeviceV1, topic, message);
    expect(publishCallback).toHaveBeenCalled();
  });
});
