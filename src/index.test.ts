import { MqttClient as MqttJsClient, IClientPublishOptions } from 'mqtt';
import { Buffer } from 'buffer';

type HandlerEvent = 'message' | 'connect' | 'error' | 'close';

type HandlerMap = {
  message: ((topic: string, message: Buffer) => void)[];
  connect: (() => void)[];
  error: ((err: Error) => void)[];
  close: (() => void)[];
};

interface MockMqttClient extends Partial<MqttJsClient> {
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
  connected: true,
  on: jest.fn((event: HandlerEvent, handler: (...args: any[]) => void) => {
    if (handlers[event]) handlers[event].push(handler);
    return mockClient;
  }),
  publish: jest.fn(
    (
      topic: string,
      message: string,
      options?: IClientPublishOptions,
      callback?: (err?: Error) => void,
    ) => {
      if (typeof options === 'function') {
        options(null);
      } else if (typeof callback === 'function') {
        callback(null);
      }
      return { messageId: '123' };
    },
  ),
  subscribe: jest.fn((topic: string | string[], callback?: () => void) => {
    if (callback) callback();
  }),
  end: jest.fn(),
  triggerEvent: (event: HandlerEvent, ...args: any[]) => {
    if (handlers[event]) {
      handlers[event].forEach(h => h(...args));
    }
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
  } catch (e) {}
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
    const client = require('mqtt').__mockClient;
    client.triggerEvent('connect');
    expect(client.subscribe).toHaveBeenCalledWith(
      expect.stringContaining('device/testdevice/ctrl'),
      expect.any(Function),
    );
  });

  test('should handle incoming message and publish parsed state', () => {
    require('./index');
    const client = require('mqtt').__mockClient;

    client.triggerEvent('connect');
    client.publish.mockClear();

    const message = Buffer.from('pe=85,kn=300,tim_0=06|30|22|00|1234567|400|1');
    client.triggerEvent('message', 'hame_energy/HMA-1/device/testdevice/ctrl', message);

    const calls = client.publish.mock.calls;
    const [topic, payload]: [string, string] = calls.find(
      ([t]) => t.includes('/data'),
    ) ?? ['', ''];

    expect(topic).toContain('/data');
    expect(payload).toContain('"pe":85'); // je nach Formatierung kann auch kn oder tim_0 geprüft werden
  });

  test('should trigger periodic polling and publish data request', () => {
    jest.useFakeTimers();
    require('./index');
    const client = require('mqtt').__mockClient;
    client.publish.mockClear();

    client.triggerEvent('connect');
    jest.advanceTimersByTime(5000);

    const wasCalled = client.publish.mock.calls.some(
      ([topic, message]: [string, string]) =>
        topic.includes('/ctrl') && message.includes('cd=1'),
    );

    expect(wasCalled).toBe(true);
    jest.useRealTimers();
  });
});

afterAll(() => {
  jest.clearAllTimers();
  jest.restoreAllMocks();
});
