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
      const periodIndex = parseInt(key.slice(4), 10);
      const [startH, startM, endH, endM, weekday, power, enabled] = value.split('|');
      result[`timePeriods.${periodIndex}.startTime`] = `${startH}:${startM.padStart(2, '0')}`;
      result[`timePeriods.${periodIndex}.endTime`] = `${endH}:${endM.padStart(2, '0')}`;
      result[`timePeriods.${periodIndex}.weekday`] = weekday;
      result[`timePeriods.${periodIndex}.power`] = parseInt(power, 10);
      result[`timePeriods.${periodIndex}.enabled`] = enabled === '1';
    } else {
      result[key] = isNaN(Number(value)) ? value : Number(value);
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
    private deviceManager: DeviceManager
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
    client.on('reconnect', () => console.log('Attempting to reconnect to MQTT broker...'));
    client.on('offline', () => console.log('MQTT client is offline'));
    client.on('message', this.handleMessage.bind(this));
    client.on('error', this.handleError.bind(this));
    client.on('close', this.handleClose.bind(this));

    return client;
  }

  private handleConnect(): void {
    console.log('Connected to MQTT broker');
    this.publish('hame_energy/availability', 'online', { qos: 1, retain: true });

    this.deviceManager.getDevices().forEach(device => {
      const topics = this.deviceManager.getDeviceTopics(device);
      if (!topics) return;

      this.subscribe(topics.deviceTopic);
      this.subscribeToControlTopics(device);
      this.publish(topics.availabilityTopic, 'offline', { qos: 1, retain: true });
      this.publishDiscoveryConfigs(device);

      const flatState = this.deviceManager.getFlattenedDeviceState(device);
      this.publish(`${topics.publishTopic}/data`, JSON.stringify(flatState), { qos: 1 });
    });

    this.setupPeriodicPolling();
  }

  private handleMessage(topic: string, message: Buffer): void {
    const raw = message.toString();
    console.log(`MQTT message received on ${topic}: ${raw}`);

    const match = topic.match(/hame_energy\/([\w-]+)\/device\/([\w]+)\/ctrl/);
    if (match) {
      const [, deviceType, deviceId] = match;
      const parsed = parseKeyValueStringToJson(raw);
      const publishTopic = `hame_energy/${deviceType}/device/${deviceId}/data`;
      this.publish(publishTopic, JSON.stringify(parsed), { qos: 1 }).catch(err => {
        console.error(`Fehler beim Publizieren für ${deviceId}:`, err);
      });
    }
  }

  subscribe(topic: string | string[]): void {
    this.client.subscribe(topic, err => {
      if (err) console.error(`Subscription error for ${topic}:`, err);
    });
  }

  private subscribeToControlTopics(device: any): void {
    const controlTopics = this.deviceManager.getControlTopics(device);
    this.subscribe(controlTopics);
  }

  publish(topic: string, message: string, options: mqtt.IClientPublishOptions = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.publish(topic, message, options, err => {
        if (err) {
          console.error(`Error publishing to ${topic}:`, err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  private setupPeriodicPolling(): void {
    const pollingInterval = this.deviceManager.getPollingInterval();
    this.deviceManager.getDevices().forEach(device => this.requestDeviceData(device));
    if (this.pollingInterval) clearInterval(this.pollingInterval);
    this.pollingInterval = setInterval(() => {
      this.deviceManager.getDevices().forEach(device => this.requestDeviceData(device));
    }, pollingInterval);
  }

  private publishDiscoveryConfigs(device: Device) {
    const topics = this.deviceManager.getDeviceTopics(device);
    if (topics) {
      const info = this.getAdditionalDeviceInfo(device);
      publishDiscoveryConfigs(this.client, device, topics, info);
    }
  }

  private getAdditionalDeviceInfo(device: Device) {
    const def = getDeviceDefinition(device.deviceType);
    const state = this.deviceManager.getDeviceState(device);
    let info: AdditionalDeviceInfo = {};
    if (state && def) {
      for (const msg of def.messages) {
        info = { ...info, ...msg.getAdditionalDeviceInfo(state as BaseDeviceData) };
      }
    }
    return info;
  }

  private lastRequestTime: Map<string, number> = new Map();

  requestDeviceData(device: Device): void {
    const topics = this.deviceManager.getDeviceTopics(device);
    const def = getDeviceDefinition(device.deviceType);
    if (!def || !topics) return;

    const controlTopic = topics.deviceControlTopic;
    def.messages.forEach((msg, idx) => {
      const key = `${device.deviceId}:${idx}`;
      const last = this.lastRequestTime.get(key);
      const now = Date.now();
      if (last == null || now > last + msg.pollInterval) {
        this.lastRequestTime.set(key, now);
        setTimeout(() => {
          this.publish(controlTopic, msg.refreshDataPayload, { qos: 1 }).catch(err => {
            console.error(`Fehler beim Senden an ${controlTopic}:`, err);
          });
        }, idx * 100);
      }
    });
  }

  private handleError(error: Error): void {
    console.error('MQTT client error:', error);
  }

  private handleClose(): void {
    if (this.pollingInterval) clearInterval(this.pollingInterval);
    if (this.discoveryInterval) clearInterval(this.discoveryInterval);
  }

  async close(): Promise<void> {
    this.deviceManager.getDevices().forEach(device => {
      const topics = this.deviceManager.getDeviceTopics(device);
      if (topics) {
        this.publish(topics.availabilityTopic, 'offline', { qos: 1, retain: true });
      }
    });
    this.publish('hame_energy/availability', 'offline', { qos: 1, retain: true });
    if (this.pollingInterval) clearInterval(this.pollingInterval);
    if (this.discoveryInterval) clearInterval(this.discoveryInterval);
    this.client.end();
  }
}
