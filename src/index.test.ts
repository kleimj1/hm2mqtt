import type { MqttClient } from 'mqtt';

type MockHandler = (...args: any[]) => void;
type HandlerMap = {
  [key in 'message' | 'connect' | 'error' | 'close']?: MockHandler[];
};

jest.useFakeTimers();

// Mock mqtt
jest.mock('mqtt', () => {
  const handlers: HandlerMap = {
    message: [],
    connect: [],
    error: [],
    close: [],
  };

  const mockClient: Partial<MqttClient> & {
    __handlers: HandlerMap;
    triggerEvent: (event: keyof HandlerMap, ...args: any[]) => void;
  } = {
    on: jest.fn().mockImplementation(function (this: any, event: keyof HandlerMap, handler: MockHandler) {
      if (!handlers[event]) {
        handlers[event] = [];
      }
      handlers[event]!.push(handler);
      return this;
    }),
    publish: jest.fn((topic, message, options, callback) => {
      if (callback) callback(null);
      return { messageId: '123' };
    }),
    subscribe: jest.fn((topic, callback) => {
      if (callback) callback(null);
    }),
    end: jest.fn(),
    connected: true,
    __handlers: handlers,
    triggerEvent(event: keyof HandlerMap, ...args: any[]) {
      handlers[event]?.forEach(handler => handler(...args));
    },
  };

  return {
    connect: jest.fn(() => mockClient),
    __mockClient: mockClient,
  };
});

// Mock dotenv
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

describe('MQTT Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules(); // Reset module cache
  });

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
      expect.stringContaining('hame_energy/HMA-1/device/testdevice/ctrl'),
      expect.any(Function),
    );
  });

  test('should handle periodic polling', () => {
    require('./index');
    const mockClient = require('mqtt').__mockClient;
    mockClient.triggerEvent('connect');

    jest.advanceTimersByTime(5000);

    expect(mockClient.publish).toHaveBeenCalledWith(
      expect.stringContaining('hame_energy/HMA-1/App/testdevice/ctrl'),
      expect.stringContaining('cd=1'),
      expect.any(Object),
      expect.any(Function),
    );
  });
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

afterAll(() => {
  jest.restoreAllMocks();
  jest.resetModules();
});