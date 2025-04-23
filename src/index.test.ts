import { MqttClient } from 'mqtt';
import { mocked } from 'ts-jest/utils';

// Set test environment
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

// Define allowed events
type HandlerEvent = 'connect' | 'message' | 'error' | 'close';
type HandlerMap = {
  [K in HandlerEvent]: ((...args: any[]) => void)[];
};

const handlers: HandlerMap = {
  connect: [],
  message: [],
  error: [],
  close: [],
};

const mockClient = {
  on: jest.fn((event: HandlerEvent, handler: (...args: any[]) => void) => {
    handlers[event].push(handler);
    return mockClient;
  }),
  publish: jest.fn(
    (topic: string, message: string, options?: any, callback?: any) => {
      if (typeof options === 'function') options(null);
      if (typeof callback === 'function') callback(null);
      return { messageId: '123' };
    },
  ),
  subscribe: jest.fn((topic: string | string[], callback?: any) => {
    if (callback) callback(null, []);
  }),
  end: jest.fn(),
  connected: true,
  __handlers: handlers,
  triggerEvent: (event: HandlerEvent, ...args: any[]) => {
    handlers[event].forEach(h => h(...args));
  },
};

jest.mock('mqtt', () => ({
  connect: jest.fn(() => mockClient),
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.resetModules();
});

afterEach(() => {
  try {
    const { __test__ } = require('./index');
    if (__test__?.mqttClient?.stopPolling) {
      __test__.mqttClient.stopPolling();
    }
  } catch {
    // Testmodul evtl. nicht geladen
  }
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('MQTT Client', () => {
  test('should initialize MQTT client with correct options', () => {
    require('./index');
    const mqtt = require('mqtt');
    expect(mqtt.connect).toHaveBeenCalledWith(
      'mqtt://test-broker:1883',
      expect.objectContaining({
        clientId: 'test-client',
        username: 'testuser',
        password: 'testpass',
        clean: true,
      }),
    );
  });

  test('should subscribe to device topics on connect', () => {
    require('./index');
    mockClient.triggerEvent('connect');
    expect(mockClient.subscribe).toHaveBeenCalledWith(
      expect.stringContaining('/ctrl'),
      expect.any(Function),
    );
  });

  test('should handle incoming message and publish parsed state', () => {
    require('./index');
    mockClient.triggerEvent('connect');
    mockClient.publish.mockClear();

    const message = Buffer.from('pe=85,kn=300,tim_0=06|30|22|00|1234567|400|1');
    mockClient.triggerEvent('message', 'hame_energy/HMA-1/device/test123/ctrl', message);

    const calls = mockClient.publish.mock.calls;
    const [topic, payload]: [string, string] =
      calls.find(([t]: [string]) => t.includes('/data')) ?? ['', ''];

    expect(topic).toContain('/data');
    expect(payload).toContain('"batteryPercentage":85');
  });

  test('should trigger periodic polling and publish data request', () => {
    require('./index');
    mockClient.triggerEvent('connect');
    mockClient.publish.mockClear();

    jest.advanceTimersByTime(5000);

    const wasCalled = mockClient.publish.mock.calls.some(
      ([topic, message]: [string, string]) =>
        topic.includes('/ctrl') && message.includes('cd=1'),
    );

    expect(wasCalled).toBe(true);
    jest.useRealTimers();
  });
});
