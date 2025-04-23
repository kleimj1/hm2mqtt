import { parseMessage } from './parser';
import { VenusDeviceData } from './types';

describe('MQTT Message Parser for HMG (Venus)', () => {
  test('should parse cd=14 Venus BMS message correctly', () => {
    const message = 'cd=14,b_soc=65,b_soh=100,b_vol=5223,b_cur=-94,b_tp1=25,b_vo1=3265';
    const deviceType = 'HMG';
    const deviceId = 'venus-001';

    const parsed = parseMessage(message, deviceType, deviceId);
    const bms = parsed['bms'] as VenusDeviceData['bms'];

    expect(bms?.bms_soc).toBe(65);
    expect(bms?.bms_soh).toBe(100);
    expect(bms?.bms_voltage).toBe(5223);
    expect(bms?.bms_current).toBe(-94);
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
});
