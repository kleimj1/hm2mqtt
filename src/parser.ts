import { B2500V2DeviceData } from './types';
import {
  KeyPath,
  BaseDeviceData,
  getDeviceDefinition,
  FieldDefinition,
  TypeAtPath,
} from './deviceDefinition';
import { transformNumber } from './device/helpers';

/**
 * Parse the incoming MQTT message and transform it into the required format
 *
 * @param message - The raw message payload as a string (comma-separated key-value pairs)
 * @param deviceType - The device type extracted from the topic
 * @param deviceId - The device ID extracted from the topic
 * @returns The parsed data object
 */
export function parseMessage(
  message: string,
  deviceType: string,
  deviceId: string,
): Record<string, BaseDeviceData> {
  const deviceDefinition = getDeviceDefinition(deviceType);
  try {
    // Parse the comma-separated key-value pairs
    const pairs = message.split(',');
    const values: Record<string, string> = {};

    // Process each key-value pair
    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      values[key] = value;
    }

    let result: Record<string, BaseDeviceData> = {};
    for (const messageDefinition of deviceDefinition?.messages ?? []) {
      if (messageDefinition.isMessage(values)) {
        // Create the base parsed data object
        const parsedData: BaseDeviceData = {
          deviceType,
          deviceId,
          timestamp: new Date().toISOString(),
          values,
        };

        // Apply the device status message definition
        applyMessageDefinition(parsedData, values, messageDefinition?.fields ?? []);
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

function applyMessageDefinition<T extends BaseDeviceData>(
  parsedData: VenusDeviceData,
  values: Record<string, string>,
  fields: FieldDefinition<VenusDeviceData, KeyPath<VenusDeviceData>>[],
): void {
  const keyAliases: Record<string, KeyPath<T>> = {
    pe: ['batteryPercentage'] as KeyPath<T>,
    kn: ['batteryCapacity'] as KeyPath<T>,
    w1: ['solarPower', 'input1'] as KeyPath<T>,
    w2: ['solarPower', 'input2'] as KeyPath<T>,
    g1: ['gridPower', 'input1'] as KeyPath<T>,
    g2: ['gridPower', 'input2'] as KeyPath<T>,
    tl: ['temperature', 'low'] as KeyPath<T>,
    th: ['temperature', 'high'] as KeyPath<T>,
    do: ['depthOfDischarge'] as KeyPath<T>,
  };

  for (const field of fields) {
    const key = field.key;
    const transform = field.transform ?? transformNumber;

    if (typeof key === 'string') {
      const value = values[key];
      const aliasPath = keyAliases[key] ?? field.path;

      if (value != null) {
        const transformedValue = transform(value);
        setValueAtPath(parsedData, aliasPath, transformedValue);
      }
    } else if (field.transform != null) {
      const entries = key.map(k => [k, values[k]] as const);
      if (entries.every(([, val]) => val !== undefined)) {
        const transformedValue = field.transform(Object.fromEntries(entries));
        setValueAtPath(parsedData, field.path, transformedValue);
      } else {
        console.warn(`Missing values for compound field: ${field.path.join('.')}`);
      }
    } else {
      console.warn(`No transform for compound field: ${field.path.join('.')}`);
    }
  }
}
/**
 * Set a value at a specific path in an object
 *
 * @param obj - The object to modify
 * @param path - The path to set the value at
 * @param value - The value to set
 */
function setValueAtPath<T>(obj: T, path: KeyPath<T>, value: any): void {
  let current = obj as any;

  // Navigate to the second-to-last element in the path
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];

    // Create the object if it doesn't exist
    if (current[key] === undefined) {
      // If the next key is a number or can be parsed as a number, create an array
      const nextKey = path[i + 1];
      const isNextKeyNumeric =
        typeof nextKey === 'number' ||
        (typeof nextKey === 'string' && !isNaN(parseInt(nextKey, 10)));
      current[key] = isNextKeyNumeric ? [] : {};
    }

    current = current[key];
  }

  // Set the value at the last path element
  const lastKey = path[path.length - 1];
  current[lastKey] = value;
}
