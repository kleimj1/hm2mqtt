import * as mqtt from 'mqtt';
import { Device, MqttConfig } from './types';
import { DeviceManager } from './deviceManager';
import { publishDiscoveryConfigs } from './generateDiscoveryConfigs';
import { AdditionalDeviceInfo, BaseDeviceData, getDeviceDefinition } from './deviceDefinition';

function parseKeyValueStringToJson(data: string): Record<string, any> {
  const result: Record<string, any> = {};
  const pairs = data.split(',');

  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (!key || value === undefined) continue;

    if (key.startsWith('tim_')) {
      const idx = parseInt(key.slice(4), 10);
      const [startH, startM, endH, endM, weekday, power, enabled] = value.split('|');
      result[`timePeriods.${idx}.startTime`] = `${startH}:${startM.padStart(2, '0')}`;
      result[`timePeriods.${idx}.endTime`] = `${endH}:${endM.padStart(2, '0')}`;
      result[`timePeriods.${idx}.weekday`] = weekday;
      result[`timePeriods.${idx}.power`] = parseInt(power, 10);
      result[`timePeriods.${idx}.enabled`] = enabled === '1';
    } else {
      // Mapping bekannter Abkürzungen auf semantische Keys
      switch (key) {
        case 'pe':
          result['batteryPercentage'] = Number(value);
          break;
        case 'kn':
          result['batteryCapacity'] = Number(value);
          break;
        default:
          result[key] = isNaN(Number(value)) ? value : Number(value);
      }
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
        topic: 'hame_energy/availability',
        payload: 'offline',
        qos: 1 as const,
        retain: true,
      },
    };

    const client = mqtt.connect(this.config.brokerUrl, options);

    client.on('connect', this.handleConnect.bind(this));
    client.on('message', this.handleMessage.bind(this));
    client.on('error', this.handleError.bind(this));
    client.on('close', this.handleClose.bind(this));

    return client;
  }

  private handleMessage(topic: string, message: Buffer): void {
    const msgStr = message.toString('utf8');
    const deviceId = topic.split('/')[3];
    const device = this.deviceManager.getDevices().find(device => device.deviceId === deviceId);

    if (!device) {
      console.warn(`Device ${deviceId} not found for topic ${topic}`);
      return;
    }

    const jsonData = parseKeyValueStringToJson(msgStr);
    this.deviceManager.updateDeviceState(device, 'data', state => ({ ...state, ...jsonData }));

    const topics = this.deviceManager.getDeviceTopics(device);
    if (topics) {
      this.publish(topics.publishTopic + '/data', JSON.stringify(this.deviceManager.getFlattenedDeviceState(device)), {
        qos: 1,
        retain: false,
      }).catch(err => console.error(`Fehler beim Veröffentlichen:`, err));
    }
  }

  private handleConnect(): void {
    this.publish('hame_energy/availability', 'online', { qos: 1, retain: true });

    this.deviceManager.getDevices().forEach(device => {
      const topics = this.deviceManager.getDeviceTopics(device);
      if (!topics) return;

      this.subscribe(topics.deviceTopic);
      this.subscribe(this.deviceManager.getControlTopics(device));
      this.publish(topics.availabilityTopic, 'offline', { qos: 1, retain: true });
      this.publishDiscoveryConfigs(device);
    });

    this.setupPeriodicPolling();
  }

  private setupPeriodicPolling(): void {
    const interval = this.deviceManager.getPollingInterval();
    this.pollingInterval = setInterval(() => {
      this.deviceManager.getDevices().forEach(device => this.requestDeviceData(device));
    }, interval);

    this.discoveryInterval = setInterval(() => {
      this.deviceManager.getDevices().forEach(device => this.publishDiscoveryConfigs(device));
    }, 3600000);
  }

  private publishDiscoveryConfigs(device: Device) {
    const topics = this.deviceManager.getDeviceTopics(device);
    const additionalInfo = this.getAdditionalDeviceInfo(device);
    if (topics) publishDiscoveryConfigs(this.client, device, topics, additionalInfo);
  }

  private getAdditionalDeviceInfo(device: Device): AdditionalDeviceInfo {
    const def = getDeviceDefinition(device.deviceType);
    const state = this.deviceManager.getDeviceState(device);
    let result: AdditionalDeviceInfo = {};
    if (state && def) {
      for (const msg of def.messages) {
        result = { ...result, ...msg.getAdditionalDeviceInfo(state as BaseDeviceData) };
      }
    }
    return result;
  }

  subscribe(topic: string | string[]): void {
    this.client.subscribe(topic, err => {
      if (err) console.error(`Fehler beim Abonnieren von ${topic}:`, err);
    });
  }

  publish(topic: string, message: string, options: mqtt.IClientPublishOptions = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.publish(topic, message, options, err => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  requestDeviceData(device: Device): void {
    const def = getDeviceDefinition(device.deviceType);
    const topics = this.deviceManager.getDeviceTopics(device);
    if (!def || !topics) return;

    const controlTopic = topics.deviceControlTopic;
    const msg = def.messages.find(m => m.refreshDataPayload === 'cd=1');
    if (msg) {
      this.publish(controlTopic, msg.refreshDataPayload, { qos: 1 }).catch(console.error);
    }

    def.messages.forEach((message, idx) => {
      if (message.refreshDataPayload !== 'cd=1') {
        setTimeout(() => {
          this.publish(controlTopic, message.refreshDataPayload, { qos: 1 }).catch(console.error);
        }, idx * 100);
      }
    });
  }

  private handleError(error: Error): void {
    console.error('MQTT Fehler:', error);
  }

  private handleClose(): void {
    console.log('MQTT Verbindung geschlossen');
    if (this.pollingInterval) clearInterval(this.pollingInterval);
    if (this.discoveryInterval) clearInterval(this.discoveryInterval);
  }
  // am Ende der Klasse MqttClient hinzufügen
  async close(): Promise<void> {
    console.log('Closing MQTT connection');
    this.stopPolling(); // <--- Wichtig!
    try {
      await this.publish('hame_energy/availability', 'offline', { qos: 1, retain: true });
      await Promise.all(
        this.deviceManager.getDevices().map(device => {
          const topics = this.deviceManager.getDeviceTopics(device);
          if (topics) {
            return this.publish(topics.availabilityTopic, 'offline', { qos: 1, retain: true });
          }
          return Promise.resolve();
        }),
      );
    } catch (error) {
      console.error('Error publishing offline status:', error);
    }

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = null;
    }

    this.client.end();
  }
  public stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = null;
    }
  }
}
