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
    process.env.DEVICE_1 = 'HMA-1:test123';
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

describe('MQTT Client', () => {
  test('should publish device data after receiving a message', () => {
    require('./index');
    const mqttMock = require('mqtt');
    const client = mqttMock.__mockClient;

    client.triggerEvent('connect');

    const message = Buffer.from('pe=85,kn=300,tim_0=06|30|22|00|1234567|400|1');
    client.triggerEvent('message', 'hame_energy/HMA-1/device/test123/ctrl', message);

    const calls = client.publish.mock.calls;
    const [topic, payload]: [string, string] = calls.find(([t]: [string, string]) => t.includes('/data')) ?? ['', ''];

    expect(topic).toContain('/data');
    expect(payload).toContain('"batteryPercentage":85'); // Erwarteter Key in geparstem JSON
  });

  test('should trigger periodic polling and publish data request', () => {
    require('./index');
    const mqttMock = require('mqtt');
    const client = mqttMock.__mockClient;

    client.triggerEvent('connect');

    client.publish.mockClear();
    jest.advanceTimersByTime(5000);

    const calls = client.publish.mock.calls;
    const wasCalled = calls.some(
      ([topic, message]: [string, string]) =>
        topic.includes('/ctrl') && message.includes('cd=1')
    );

    expect(wasCalled).toBe(true);
  });
});
