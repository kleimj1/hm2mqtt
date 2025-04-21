
import * as mqtt from 'mqtt';
import { Device, MqttConfig } from './types';
import { DeviceManager } from './deviceManager';
import { publishDiscoveryConfigs } from './generateDiscoveryConfigs';
import { AdditionalDeviceInfo, BaseDeviceData, getDeviceDefinition } from './deviceDefinition';

function parseMessagePayload(payload: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of payload.split(',')) {
    const [key, value] = pair.split('=');
    if (key !== undefined && value !== undefined) {
      result[key.trim()] = value.trim();
    }
  }
  return result;
}

export class MqttClient {
  private client: mqtt.MqttClient;
  private pollingInterval: NodeJS.Timeout | null = null;
  private discoveryInterval: NodeJS.Timeout | null = null;

  constructor(
    private config: MqttConfig,
    private deviceManager: DeviceManager,
    private messageHandler: (topic: string, message: Buffer) => void,
  ) {
    this.client = this.setupClient();
  }

  private setupClient(): mqtt.MqttClient {
    const options = {
      clientId: this.config.clientId,
      username: this.config.username,
      password: this.config.password,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 30000,
      will: {
        topic: `hame_energy/availability`,
        payload: 'offline',
        qos: 1 as const,
        retain: true,
      },
    };

    console.log(`Connecting to MQTT broker at ${this.config.brokerUrl} with client ID ${this.config.clientId}`);
    console.log(`MQTT username: ${this.config.username ? this.config.username : 'not provided'}`);
    console.log(`MQTT password: ${this.config.password ? '******' : 'not provided'}`);

    const client = mqtt.connect(this.config.brokerUrl, options);

    client.on('connect', this.handleConnect.bind(this));
    client.on('reconnect', () => console.log('Attempting to reconnect to MQTT broker...'));
    client.on('offline', () => console.log('MQTT client is offline'));
    client.on('message', (topic, message) => {
      const payload = message.toString();
      const parsed = parseMessagePayload(payload);
      console.debug(`[MQTT] Raw payload on topic "${topic}":`, payload);
      console.debug(`[MQTT] Parsed values:`, parsed);
      this.messageHandler(topic, message);
    });
    client.on('error', this.handleError.bind(this));
    client.on('close', this.handleClose.bind(this));

    return client;
  }

  // ... (Rest der Klasse bleibt unverändert)
}
