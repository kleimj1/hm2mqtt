import { VenusDeviceData } from './types';
import {
  KeyPath,
  getDeviceDefinition,
  FieldDefinition,
  TypeAtPath,
} from './deviceDefinition';
import { transformNumber } from './device/helpers';

/**
 * Parse the incoming MQTT message and transform it into the required format
 * for a Venus (HMG-25) device.
 */
export function parseMessage(
  message: string,
  deviceType: string,
  deviceId: string,
): Record<string, VenusDeviceData> {
  const deviceDefinition = getDeviceDefinition(deviceType);
  try {
    const values: Record<string, string> = {};
    for (const pair of message.split(',')) {
      const [key, value] = pair.split('=');
      if (key) values[key] = value;
    }

    const result: Record<string, VenusDeviceData> = {};

    for (const messageDefinition of deviceDefinition?.messages ?? []) {
      if (messageDefinition.isMessage(values)) {
        const parsedData: VenusDeviceData = {
          deviceType,
          deviceId,
          timestamp: new Date().toISOString(),
          values,
        } as VenusDeviceData;

        applyMessageDefinition(parsedData, values, messageDefinition.fields ?? []);
        result[messageDefinition.publishPath] = parsedData;
      }
    }

    return result;
  } catch (error) {
    console.error('Error parsing message:', error);
    throw new Error(
      `Failed to parse message: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function applyMessageDefinition<T extends VenusDeviceData>(
  parsedData: T,
  values: Record<string, string>,
  fields: FieldDefinition<T, KeyPath<T>>[],
): void {
  for (const field of fields) {
    if (typeof field.key === 'string') {
      const transform = field.transform ?? transformNumber;
      const value = values[field.key];
      if (value != null) {
        const transformed = transform(value);
        setValueAtPath(parsedData, field.path, transformed);
      }
    } else if (field.transform) {
      const inputValues = Object.fromEntries(
        field.key.map(key => [key, values[key]] as const),
      );
      const transformed = field.transform(inputValues);
      setValueAtPath(parsedData, field.path, transformed);
    }
  }
}

function setValueAtPath<T>(obj: T, path: KeyPath<T>, value: any): void {
  let current = obj as any;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (current[key] === undefined) {
      const nextKey = path[i + 1];
      const isArray = typeof nextKey === 'number' || (typeof nextKey === 'string' && !isNaN(+nextKey));
      current[key] = isArray ? [] : {};
    }
    current = current[key];
  }
  current[path[path.length - 1]] = value;
}
