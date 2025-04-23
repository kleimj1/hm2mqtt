import { ControlHandler } from './controlHandler';
import { DeviceManager } from './deviceManager';
import { Device, MqttConfig, VenusDeviceData } from './types';

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

    deviceManager = new DeviceManager(config);
    publishCallback = jest.fn();
    controlHandler = new ControlHandler(deviceManager, publishCallback);

    deviceState = {
      bms: {
        bms_soc: 70,
        bms_voltage: 5200,
      },
      batterySoc: 70,
      combinedPower: 1500,
      workingStatus: 'charging',
    };

    deviceManager.setDeviceState(testDeviceV1, deviceState);
  });

  it('should handle known control topic', () => {
    const topic = `hm2mqtt/${testDeviceV1.deviceId}/control/refresh`;
    const message = 'PRESS';

    controlHandler.handleControlTopic(testDeviceV1, topic, message);

    expect(publishCallback).toHaveBeenCalled();
  });

  it('should warn on unknown control topic', () => {
    const topic = `hm2mqtt/${testDeviceV1.deviceId}/control/foobar`;
    const message = 'whatever';

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    controlHandler.handleControlTopic(testDeviceV1, topic, message);

    expect(warnSpy).toHaveBeenCalledWith('Unknown control topic:', topic);
    warnSpy.mockRestore();
  });

  it('should send cd=1 on runtime info refresh', () => {
    const topic = `hm2mqtt/${testDeviceV1.deviceId}/control/refresh`;
    const message = 'PRESS';

    controlHandler.handleControlTopic(testDeviceV1, topic, message);

    expect(publishCallback).toHaveBeenCalledWith(expect.stringContaining('cd=1'));
  });

  it('should send cd=4 on sync-time', () => {
    const topic = `hm2mqtt/${testDeviceV1.deviceId}/control/sync-time`;
    const message = 'PRESS';

    controlHandler.handleControlTopic(testDeviceV1, topic, message);

    expect(publishCallback).toHaveBeenCalledWith(expect.stringContaining('cd=4'));
  });

  it('should send cd=9 on firmware upgrade', () => {
    const topic = `hm2mqtt/${testDeviceV1.deviceId}/control/upgrade`;
    const message = 'PRESS';

    controlHandler.handleControlTopic(testDeviceV1, topic, message);

    expect(publishCallback).toHaveBeenCalledWith(expect.stringContaining('cd=9'));
  });

  it('should send cd=14 on BMS info request', () => {
    const topic = `hm2mqtt/${testDeviceV1.deviceId}/control/bms-refresh`;
    const message = 'PRESS';

    controlHandler.handleControlTopic(testDeviceV1, topic, message);

    expect(publishCallback).toHaveBeenCalledWith(expect.stringContaining('cd=14'));
  });
});
