// 👇 Dein überarbeiteter vollständiger Jest-Test (inkl. Timer-Aufräumung)
beforeAll(() => {
  jest.clearAllMocks();
  jest.useFakeTimers(); // Timer kontrollieren
});

// Mock the mqtt module
jest.mock('mqtt', () => {
  const mockClient = {
    on: jest.fn(),
    publish: jest.fn((topic, message, options, callback) => {
      if (callback) callback(null);
      return { messageId: '123' };
    }),
    subscribe: jest.fn((topic, callback) => {
      if (callback) callback(null);
    }),
    end: jest.fn(),
    connected: true,
  };

  const handlers = {
    message: [],
    connect: [],
    error: [],
    close: [],
  };

  mockClient.on.mockImplementation((event, handler) => {
    if (handlers[event]) {
      handlers[event].push(handler);
    }
    return mockClient;
  });

  mockClient.triggerEvent = (event, ...args) => {
    if (handlers[event]) {
      handlers[event].forEach(handler => handler(...args));
    }
  };

  return {
    connect: jest.fn(() => mockClient),
    __mockClient: mockClient,
    __handlers: handlers,
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
  jest.clearAllTimers(); // Wichtig für Timer-Aufräumung
  jest.useRealTimers();
});

afterAll(() => {
  jest.restoreAllMocks();
  jest.resetModules();
});
