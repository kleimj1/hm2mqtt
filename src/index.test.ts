import { jest } from '@jest/globals';

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

    const message = Buffer.from('cd=1,batterySoc=70,bms_voltage=5223,cel_p=300');
    client.triggerEvent('message', 'hm2mqtt/HMG/device/testHMG/data', message);

    const calls = client.publish.mock.calls;
    const [topic, payload]: [string, string] = calls.find(([t]: [string, string]) => t.includes('/data')) ?? ['', ''];

    expect(topic).toContain('/data');
    expect(payload).toContain('"batterySoc":70');
    expect(payload).toContain('"bms_voltage":5223');
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
