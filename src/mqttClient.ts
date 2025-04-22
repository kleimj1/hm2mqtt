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

    // Sonderbehandlung für Zeitperioden (tim_*)
    if (key.startsWith('tim_')) {
      const periodIndex = parseInt(key.slice(4));
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

    console.log(`Connecting to MQTT broker at ${this.config.brokerUrl} with client ID ${this.config.clientId}`);
    console.log(`MQTT username: ${this.config.username ? this.config.username : 'not provided'}`);
    console.log(`MQTT password: ${this.config.password ? '******' : 'not provided'}`);

    const client = mqtt.connect(this.config.brokerUrl, options);

    client.on('connect', this.handleConnect.bind(this));
    client.on('reconnect', () => console.log('Attempting to reconnect to MQTT broker...'));
    client.on('offline', () => console.log('MQTT client is offline'));
    client.on('message', this.messageHandler);
    client.on('error', this.handleError.bind(this));
    client.on('close', this.handleClose.bind(this));

    return client;
  }

  private handleConnect(): void {
    console.log('Connected to MQTT broker');

    this.publish('hame_energy/availability', 'online', { qos: 1, retain: true });

    this.deviceManager.getDevices().forEach(device => {
      const topics = this.deviceManager.getDeviceTopics(device);

      if (!topics) {
        console.error(`No topics found for device ${device.deviceId}`);
        return;
      }

      this.subscribe(topics.deviceTopic);
      this.subscribeToControlTopics(device);
      this.publish(topics.availabilityTopic, 'offline', { qos: 1, retain: true });
      this.publishDiscoveryConfigs(device);

      const flatState = this.deviceManager.getFlattenedDeviceState(device);
      const dataTopic = `${topics.publishTopic}/data`;
      this.publish(dataTopic, JSON.stringify(flatState), { qos: 1 }).catch(err => {
        console.error(`Error publishing initial device data for ${device.deviceId}:`, err);
      });
    });

    this.setupPeriodicPolling();
  }

  private getAdditionalDeviceInfo(device: Device) {
    const deviceDefinitions = getDeviceDefinition(device.deviceType);
    const deviceState = this.deviceManager.getDeviceState(device);
    let additionalDeviceInfo: AdditionalDeviceInfo = {};
    if (deviceState != null && deviceDefinitions != null) {
      for (const message of deviceDefinitions.messages) {
        additionalDeviceInfo = {
          ...additionalDeviceInfo,
          ...message.getAdditionalDeviceInfo(deviceState as BaseDeviceData),
        };
      }
    }
    return additionalDeviceInfo;
  }

  subscribe(topic: string | string[]): void {
    this.client.subscribe(topic, err => {
      if (err) {
        console.error(`Subscription error for ${topic}:`, err);
        return;
      }
      console.log(`Subscribed to topic: ${topic}`);
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
          return;
        }
        console.log(`Published to ${topic}: ${message.length > 100 ? message.substring(0, 100) + '...' : message}`);
        resolve();
      });
    });
  }

  private setupPeriodicPolling(): void {
    const pollingInterval = this.deviceManager.getPollingInterval();
    console.log(`Setting up periodic polling every ${pollingInterval / 1000} seconds`);

    this.deviceManager.getDevices().forEach(device => {
      this.requestDeviceData(device);
    });

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    this.pollingInterval = setInterval(() => {
      this.deviceManager.getDevices().forEach(device => {
        this.requestDeviceData(device);
      });
    }, pollingInterval);

    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
    }

    this.discoveryInterval = setInterval(() => {
      this.deviceManager.getDevices().forEach(device => {
        this.publishDiscoveryConfigs(device);
      });
    }, 3600000);
  }

  private publishDiscoveryConfigs(device: Device) {
    const topics = this.deviceManager.getDeviceTopics(device);

    if (topics) {
      let additionalDeviceInfo = this.getAdditionalDeviceInfo(device);
      publishDiscoveryConfigs(this.client, device, topics, additionalDeviceInfo);
    }
  }

  private lastRequestTime: Map<string, number> = new Map();

  requestDeviceData(device: Device): void {
    const topics = this.deviceManager.getDeviceTopics(device);
    const deviseDefinition = getDeviceDefinition(device.deviceType);

    if (!deviseDefinition) {
      console.error(`No definition found for device type ${device.deviceType}`);
      return;
    }

    if (!topics) {
      console.error(`No topics found for device ${device.deviceId}`);
      return;
    }

    const controlTopic = topics.deviceControlTopic;
    const availabilityTopic = topics.availabilityTopic;

    console.log(`Requesting device data for ${device.deviceId} on topic: ${controlTopic}`);

    const runtimeMessage = deviseDefinition.messages.find(m => m.refreshDataPayload === 'cd=1');
    if (runtimeMessage) {
      this.publish(controlTopic, runtimeMessage.refreshDataPayload, { qos: 1 }).catch(err => {
        console.error(`Error requesting cd=1 for ${device.deviceId}:`, err);
      });
    }

    for (const [idx, message] of deviseDefinition.messages.entries()) {
      let lastRequestTimeKey = `${device.deviceId}:${idx}`;
      const lastRequestTime = this.lastRequestTime.get(lastRequestTimeKey);
      const now = Date.now();

      if (message.refreshDataPayload === 'cd=1') continue;

      if (lastRequestTime == null || now > lastRequestTime + message.pollInterval) {
        this.lastRequestTime.set(lastRequestTimeKey, now);
        const payload = message.refreshDataPayload;
        setTimeout(() => {
          this.publish(controlTopic, payload, { qos: 1 }).catch(err => {
            console.error(`Error requesting device data for ${device.deviceId}:`, err);
          });
        }, idx * 100);
      }
    }

    const flatState = this.deviceManager.getFlattenedDeviceState(device);
    const dataTopic = `${topics.publishTopic}/data`;
    this.publish(dataTopic, JSON.stringify(flatState), { qos: 1, retain: false }).catch(err => {
      console.error(`Error publishing device data for ${device.deviceId}:`, err);
    });
  }

  private handleError(error: Error): void {
    console.error('MQTT client error:', error);
  }

  private handleClose(): void {
    console.log('Disconnected from MQTT broker');

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = null;
    }
  }

  async close(): Promise<void> {
    console.log('Closing MQTT connection');

    const publishPromises = this.deviceManager.getDevices().map(device => {
      const topics = this.deviceManager.getDeviceTopics(device);

      if (topics) {
        return this.publish(topics.availabilityTopic, 'offline', { qos: 1, retain: true });
      }

      return Promise.resolve();
    });

    publishPromises.push(
      this.publish('hame_energy/availability', 'offline', { qos: 1, retain: true }),
    );

    try {
      await Promise.race([
        Promise.all(publishPromises),
        new Promise(resolve => setTimeout(resolve, 1000)),
      ]);
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
}
