
import { jest } from '@jest/globals';
import './device/venus';

jest.mock('mqtt', () => {
  const handlers: Record<string, Function[]> = {
    connect: [],
    message: [],
    close: [],
    error: [],
  };

  const mockClient = {
    on: jest.fn((event: string, handler: Function) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
      return mockClient;
    }),
    subscribe: jest.fn((topic: string | string[], callback?: Function) => {
      if (callback) callback(null, []);
    }),
    publish: jest.fn((topic: string, message: string, options?: any, callback?: Function) => {
      if (typeof options === 'function') {
        options(null);
      } else if (typeof callback === 'function') {
        callback(null);
      }
      return { messageId: '123' };
    }),
    end: jest.fn(),
    connected: true,
    triggerEvent(event: string, ...args: any[]) {
      (handlers[event] || []).forEach(h => h(...args));
    },
  };

  return {
    connect: jest.fn(() => mockClient),
    __mockClient: mockClient,
  };
});

jest.mock('dotenv', () => ({
  config: jest.fn(() => {
    process.env.MQTT_BROKER_URL = 'mqtt://test-broker:1883';
    process.env.MQTT_CLIENT_ID = 'test-client';
    process.env.MQTT_USERNAME = 'testuser';
    process.env.MQTT_PASSWORD = 'testpass';
    process.env.DEVICE_1 = 'HMG:testHMG';
    process.env.MQTT_POLLING_INTERVAL = '5000';
    process.env.NODE_ENV = 'test';
  }),
}));

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.resetModules();
});

afterEach(() => {
  try {
    const { __test__ } = require('./index');
    __test__?.mqttClient?.stopPolling?.();
  } catch (e) {}
  jest.useRealTimers();
});

describe('MQTT Client for HMG (Venus)', () => {
  test('should publish device data after receiving a cd=1 message', () => {
    require('./index');
    const mqttMock = require('mqtt');
    const client = mqttMock.__mockClient;

    client.triggerEvent('connect');

    const message = Buffer.from(
      'cd=1,cel_p=300,cel_c=60,tot_i=1200,tot_o=800,ele_d=100,ele_m=500,' +
      'grd_d=150,grd_m=600,inc_d=10,inc_m=40,inc_a=200,grd_f=50,grd_o=300,' +
      'grd_t=3,gct_s=1,cel_s=3,err_t=0,err_a=0,dev_n=149,grd_y=0,wor_m=0'
    );
    client.triggerEvent('message', 'hm2mqtt/HMG/device/testHMG/data', message);

    const calls = client.publish.mock.calls;
    const [topic, payload]: [string, string] = calls.find(([t]: [string, string]) => t.includes('/data')) ?? ['', ''];

    expect(topic).toContain('/data');
    expect(payload).toContain('"batteryCapacity":3000');
    expect(payload).toContain('"batterySoc":60');
    expect(payload).toContain('"totalChargingCapacity":12');
  });

  test('should trigger periodic polling with cd=1', () => {
    require('./index');
    const mqttMock = require('mqtt');
    const client = mqttMock.__mockClient;

    client.triggerEvent('connect');

    client.publish.mockClear();
    jest.advanceTimersByTime(5000);

    const calls = client.publish.mock.calls;
    const wasCalled = calls.some(
      ([topic, message]: [string, string]) => topic.includes('/ctrl') && message.includes('cd=1')
    );

    expect(wasCalled).toBe(true);
  });
});
