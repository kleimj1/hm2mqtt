import { jest } from '@jest/globals';
import type { MqttClient } from 'mqtt';

type HandlerEvent = 'connect' | 'message' | 'error' | 'close';
type HandlerMap = Record<HandlerEvent, Array<(...args: any[]) => void>>;

interface MockMqttClient extends Partial<MqttClient> {
  on: jest.Mock;
  publish: jest.Mock;
  subscribe: jest.Mock;
  end: jest.Mock;
  connected: boolean;
  triggerEvent: (event: HandlerEvent, ...args: any[]) => void;
}

const handlers: HandlerMap = {
  message: [],
  connect: [],
  error: [],
  close: [],
};

const mockClient: MockMqttClient = {
  on: jest.fn((event: HandlerEvent, handler: (...args: any[]) => void) => {
    handlers[event].push(handler);
    return mockClient;
  }),
  publish: jest.fn((topic: string, message: string, options?: any, callback?: any) => {
    if (typeof options === 'function') {
      options(null);
    } else if (typeof callback === 'function') {
      callback(null);
    }
    return { messageId: '123' };
  }),
  subscribe: jest.fn((topic: string | string[], callback?: any) => {
    if (callback) callback(null, []);
  }),
  end: jest.fn(),
  connected: true,
  triggerEvent: (event: HandlerEvent, ...args: any[]) => {
    handlers[event].forEach(handler => handler(...args));
  },
};

jest.mock('mqtt', () => ({
  connect: jest.fn(() => mockClient),
  __mockClient: mockClient,
}));

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
  } catch {
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
    expect(mockClient.subscribe).toHaveBeen
