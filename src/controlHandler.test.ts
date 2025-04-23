import { ControlHandler } from './controlHandler';
import { DeviceManager } from './deviceManager';
import { Device, MqttConfig, VenusDeviceData } from './types';
import './device/venus';

describe('ControlHandler for HMG (Venus)', () => {
  let controlHandler: ControlHandler;
  let deviceManager: DeviceManager;
  let publishCallback: jest.Mock;
  let testDevice: Device;
  let deviceState: VenusDeviceData;

  beforeEach(() => {
    testDevice = {
      deviceType: 'HMG',
      deviceId: 'testHMG',
    };

    const config: MqttConfig = {
      brokerUrl: 'mqtt://test-broker',
      clientId: 'test-client',
      devices: [testDevice],
      responseTimeout: 15000,
    };

    const onUpdateState = jest.fn();
    deviceManager = new DeviceManager(config, onUpdateState);
    publishCallback = jest.fn();
    controlHandler = new ControlHandler(deviceManager, publishCallback);

    deviceState = {
      deviceType: 'HMG',
      deviceId: 'testHMG',
      timestamp: new Date().toISOString(),
      values: {},
      bms: {
        bms_soc: 70,
        bms_voltage: 5223,
      },
      batterySoc: 70,
      combinedPower: 1500,
      workingStatus: 'charging',
    };

    const key = `${testDevice.deviceType}:${testDevice.deviceId}`;
    (deviceManager as any)['deviceStates'][key] = { data: deviceState };
    (deviceManager as any)['deviceTopics'][key] = {
      deviceTopic: 'hm2mqtt/testHMG',
      publishTopic: 'hm2mqtt/testHMG/data',
      deviceControlTopic: 'hm2mqtt/testHMG/ctrl',
      controlSubscriptionTopic: 'hm2mqtt/testHMG/control',
      availabilityTopic: 'hm2mqtt/testHMG/availability',
    };
  });

  it('should handle known control topic', () => {
    const topic = 'hm2mqtt/testHMG/control/refresh';
    const message = 'PRESS';
    controlHandler.handleControlTopic(testDevice, topic, message);
    expect(publishCallback).toHaveBeenCalled();
  });
});
