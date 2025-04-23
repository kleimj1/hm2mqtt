import { MqttClient } from 'mqtt';

type HandlerEvent = 'connect' | 'message' | 'error' | 'close';

interface MockMqttClient extends Partial<MqttClient> {
  on: jest.Mock<any, any>;
  publish: jest.Mock<any, any>;
  subscribe: jest.Mock<any, any>;
  end: jest.Mock<any, any>;
  connected: boolean;
  triggerEvent: (event: HandlerEvent, ...args: any[]) => void;
}

const handlers: Record<HandlerEvent, Array<(...args: any[]) => void>> = {
  connect: [],
  message: [],
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
    if (typeof callback === 'function') {
      callback(null, []);
    }
  }),
  end: jest.fn(),
  connected: true,
  triggerEvent(event: HandlerEvent, ...args: any[]) {
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
    process.env.NODE_ENV = 'test';
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
    // Testmodul evtl. nicht geladen
  }

  jest.clearAllTimers();
  jest.useRealTimers();
});

afterAll(() => {
  jest.restoreAllMocks();
  jest.resetModules();
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
      expect.stringContaining('device/testdevice/ctrl'),
      expect.any(Function),
    );
  });

  test('should handle incoming message and publish parsed state', () => {
    require('./index');
    mockClient.triggerEvent('connect');
    mockClient.publish.mockClear();

    const message = Buffer.from('pe=85,kn=300,tim_0=06|30|22|00|1234567|400|1');
    mockClient.triggerEvent('message', 'hame_energy/HMA-1/device/testdevice/ctrl', message);

    const calls = mockClient.publish.mock.calls;
    const [topic, payload]: [string, string] = calls.find(([t]) => t.includes('/data')) ?? [];

    expect(topic).toContain('/data');
    expect(payload).toContain('"batteryPercentage":85');
  });

  test('should trigger periodic polling and publish data request', () => {
    jest.useFakeTimers();
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
