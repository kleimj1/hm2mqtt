import { jest } from '@jest/globals';

jest.mock('mqtt', () => {
  type HandlerMap = Record<'message' | 'connect' | 'error' | 'close', Array<(...args: any[]) => void>>;

  const handlers: HandlerMap = {
    message: [],
    connect: [],
    error: [],
    close: [],
  };

  const mockClient = {
    on: jest.fn().mockImplementation((event: keyof HandlerMap, handler: (...args: any[]) => void) => {
      handlers[event].push(handler);
      return mockClient;
    }),
    publish: jest.fn((topic, message, options, callback) => {
      if (typeof options === 'function') {
        options(null);
      } else if (typeof callback === 'function') {
        callback(null);
      }
      return { messageId: '123' };
    }),
    subscribe: jest.fn((topic, callback) => {
      if (callback) callback(null, []);
    }),
    end: jest.fn(),
    connected: true,
    triggerEvent: (event: keyof HandlerMap, ...args: any[]) => {
      if (handlers[event]) {
        handlers[event].forEach(handler => handler(...args));
      }
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
    process.env.DEVICE_1 = 'HMA-1:testdevice';
    process.env.MQTT_POLLING_INTERVAL = '5000';
  }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
});

afterEach(() => {
  try {
    const { __test__ } = require('./index');
    if (__test__?.mqttClient?.stopPolling) {
      __test__.mqttClient.stopPolling();
    }
  } catch (e) {
    // ignorieren
  }
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('MQTT Client', () => {
  test('should initialize MQTT client with correct options', () => {
    require('./index');
    const mqttMock = require('mqtt');
    expect(mqttMock.connect).toHaveBeenCalledWith(
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
    const mockClient = require('mqtt').__mockClient;
    mockClient.triggerEvent('connect');
    expect(mockClient.subscribe).toHaveBeenCalledWith(
      expect.stringContaining('device/testdevice/ctrl'),
      expect.any(Function),
    );
  });

  test('should handle incoming message and publish parsed state', () => {
    require('./index');
    const mockClient = require('mqtt').__mockClient;

    mockClient.triggerEvent('connect');
    mockClient.publish.mockClear();

    const message = Buffer.from('pe=85,kn=300,tim_0=06|30|22|00|1234567|400|1');
    mockClient.triggerEvent('message', 'hame_energy/HMA-1/device/testdevice/ctrl', message);

    const calls = mockClient.publish.mock.calls;
    expect(calls.length).toBeGreaterThan(0);

    const [topic, payload] = calls.find(([t]) => t.includes('/data')) ?? [];

    expect(topic).toContain('/data');
    expect(payload).toContain('"batteryPercentage":85');
  });

  test('should trigger periodic polling and publish data request', () => {
    jest.useFakeTimers();
    require('./index');
    const mockClient = require('mqtt').__mockClient;

    mockClient.triggerEvent('connect');
    mockClient.publish.mockClear();

    jest.advanceTimersByTime(5000);

    const call = mockClient.publish.mock.calls.find(([topic, message]) =>
      topic.includes('/ctrl') && message.includes('cd=1'),
    );

    expect(call).toBeDefined();

    jest.useRealTimers();
  });
});

afterAll(() => {
  jest.clearAllTimers();
  jest.restoreAllMocks();
});
