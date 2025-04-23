
import type { MqttClient, IClientPublishOptions, PacketCallback, ClientSubscribeCallback } from 'mqtt';

type MQTTEvent = 'message' | 'connect' | 'error' | 'close';

type HandlerMap = Record<MQTTEvent, Array<(...args: any[]) => void>>;

jest.useFakeTimers();

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
  } = {
    on(event: MQTTEvent, handler: (...args: any[]) => void) {
      handlers[event].push(handler);
      return this as MqttClient;
    },
    publish(
      topic: string,
      message: string | Buffer,
      options?: IClientPublishOptions,
      callback?: PacketCallback,
    ) {
      if (typeof options === 'function') {
        options(); // options used as callback
      } else if (typeof callback === 'function') {
        callback();
      }
      return this as MqttClient;
    },
    subscribe(
      topic: string | string[],
      options?: any,
      callback?: ClientSubscribeCallback,
    ) {
      if (typeof options === 'function') {
        options(null, []);
      } else if (typeof callback === 'function') {
        callback(null, []);
      }
      return this as MqttClient;
    },
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