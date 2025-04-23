import { parseMessage } from './parser';
import { VenusDeviceData } from './types';

describe('MQTT Message Parser for HMG (Venus)', () => {
  test('should parse cd=14 Venus BMS message correctly', () => {
    const message = 'cd=14,b_soc=65,b_soh=100,b_vol=5223,b_cur=-94,b_tp1=25,b_vo1=3265';
    const deviceType = 'HMG';
    const deviceId = 'venus-001';

    const parsed = parseMessage(message, deviceType, deviceId);
    const result = parsed['bms'] as VenusDeviceData;

    expect(result.bms_soc).toBe(65);
    expect(result.bms_soh).toBe(100);
    expect(result.bms_voltage).toBe(5223);
    expect(result.bms_current).toBe(-94);
  });

  test('should parse cd=1 Venus runtime message correctly', () => {
    const message = 'cd=1,cel_p=300,cel_c=60,tot_i=1200,tot_o=800,grd_t=3,grd_m=5400,ele_d=123';
    const deviceType = 'HMG';
    const deviceId = 'venus-001';

    const parsed = parseMessage(message, deviceType, deviceId);
    const result = parsed['data'] as VenusDeviceData;

    expect(result.batteryCapacity).toBe(3000);
    expect(result.batterySoc).toBe(60);
    expect(result.totalChargingCapacity).toBe(12);
    expect(result.totalDischargeCapacity).toBe(8);
    expect(result.workingStatus).toBe('discharging');
    expect(result.monthlyDischargeCapacity).toBe(54);
    expect(result.dailyChargingCapacity).toBe(1.23);
  });

  test('should parse time period configuration correctly', () => {
    const message = 'cd=1,tim_0=6|30|22|00|127|400|1';
    const deviceType = 'HMG';
    const deviceId = 'venus-001';

    const parsed = parseMessage(message, deviceType, deviceId);
    const result = parsed['data'] as VenusDeviceData;

    expect(result.timePeriods?.[0]).toMatchObject({
      startTime: '6:30',
      endTime: '22:00',
      weekday: '0123456',
      power: 400,
      enabled: true,
    });
  });

  test('should handle malformed input gracefully', () => {
    const message = 'b_soc=65,b_vol,b_cur=100';
    const parsed = parseMessage(message, 'HMG', 'venus-001');
    expect(parsed).toBeDefined();
  });

  test('should support minimal valid message', () => {
    const message = 'cd=1,cel_c=50';
    const parsed = parseMessage(message, 'HMG', 'venus-002');
    const result = parsed['data'] as VenusDeviceData;
    expect(result.batterySoc).toBe(50);
  });
});
