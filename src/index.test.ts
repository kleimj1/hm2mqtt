import type { MqttClient } from 'mqtt';
import { IClientPublishOptions, PacketCallback, ClientSubscribeCallback } from 'mqtt';

type MQTTEvent = 'message' | 'connect' | 'error' | 'close';
type HandlerMap = Record<MQTTEvent, Array<(...args: any[]) => void>>;

jest.mock('mqtt', () => {
  const handlers: HandlerMap = {
    message: [],
    connect: [],
    error: [],
    close: [],
  };

  const mockClient: Partial<MqttClient> & {
    __handlers: HandlerMap;
    triggerEvent: (event: MQTTEvent, ...args: any[]) => void;
    publish: jest.Mock;
    subscribe: jest.Mock;
  } = {
    on(event: MQTTEvent, handler: (...args: any[]) => void) {
      handlers[event].push(handler);
      return mockClient as MqttClient;
    },

    publish: jest.fn(
      (
        topic: string,
        message: string | Buffer,
        options?: IClientPublishOptions,
        callback?: PacketCallback,
      ) => {
        if (typeof options === 'function') {
          options();
        } else if (typeof callback === 'function') {
          callback();
        }
        return mockClient as MqttClient;
      },
    ),

    subscribe: jest.fn(
      (
        topic: string | string[],
        options?: IClientPublishOptions | ClientSubscribeCallback,
        callback?: ClientSubscribeCallback,
      ) => {
        const cb = typeof options === 'function' ? options : callback;
        if (cb) cb(null, [{ topic: 'test', qos: 0 }]);
        return mockClient as MqttClient;
      },
    ),

    end: jest.fn(),
    connected: true,
    __handlers: handlers,

    triggerEvent(event: MQTTEvent, ...args: any[]) {
      handlers[event].forEach(fn => fn(...args));
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

beforeAll(() => {
  jest.useFakeTimers();
});

afterAll(() => {
  jest.useRealTimers();
  jest.clearAllTimers();
});

describe('MQTT Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
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
    const mqttMock = require('mqtt');
    const mockClient = mqttMock.__mockClient;
    mockClient.triggerEvent('connect');

    expect(mockClient.subscribe).toHaveBeenCalledWith(
      expect.stringContaining('hame_energy/HMA-1/device/testdevice/ctrl'),
      expect.any(Function),
    );
  });

  test('should handle periodic polling', () => {
    require('./index');
    const mqttMock = require('mqtt');
    const mockClient = mqttMock.__mockClient;

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