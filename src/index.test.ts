
import { MqttClient } from './mqttClient';
import { DeviceManager } from './deviceManager';
import { MqttConfig } from './types';

jest.mock('mqtt', () => {
  const handlers = {
    message: [] as Array<(topic: string, message: Buffer) => void>,
    connect: [] as Array<() => void>,
    error: [] as Array<(err: Error) => void>,
    close: [] as Array<() => void>,
  };

  const mockClient = {
    on: jest.fn((event, handler) => {
      if (handlers[event]) handlers[event].push(handler);
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
    __handlers: handlers,
    __triggerEvent: (event: keyof typeof handlers, ...args: any[]) => {
      handlers[event].forEach(h => h(...args));
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

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.resetModules();
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
    mockClient.__triggerEvent('connect');
    expect(mockClient.subscribe).toHaveBeenCalled();
  });

  test('should handle incoming message and publish parsed state', () => {
    require('./index');
    const mockClient = require('mqtt').__mockClient;

    mockClient.__triggerEvent('connect');
    mockClient.publish.mockClear();

    const message = Buffer.from('pe=85,kn=300,tim_0=06|30|22|00|1234567|400|1');
    mockClient.__triggerEvent('message', 'hame_energy/HMA-1/device/testdevice/ctrl', message);

    const calls = mockClient.publish.mock.calls;
    const [topic, payload] = calls.find(([t]: [string]) => t.includes('/data')) ?? [];
    expect(topic).toContain('/data');
    expect(payload).toContain('"batteryPercentage":85');
  });

  test('should trigger periodic polling and publish data request', async () => {
    jest.useFakeTimers();
    require('./index');
    const mockClient = require('mqtt').__mockClient;

    mockClient.__triggerEvent('connect');
    mockClient.publish.mockClear();

    jest.advanceTimersByTime(5000);
    await Promise.resolve();

    const calls = mockClient.publish.mock.calls;
    const wasCalled = calls.some(
      ([topic, message]) => topic.includes('/ctrl') && message.includes('cd=1'),
    );
    expect(wasCalled).toBe(true);

    jest.useRealTimers();
  });
});

afterAll(() => {
  jest.clearAllTimers();
  jest.restoreAllMocks();
});
