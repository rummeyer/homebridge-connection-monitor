/**
 * One target in HomeKit: an occupancy sensor, occupied while it answers —
 * a phone come home, a NAS switched on, the internet up — and not occupied
 * once a whole round of pings went unanswered.
 */
import type { API, PlatformAccessory, Service } from 'homebridge';

import type { Target } from './config.ts';

export class TargetAccessory {
  readonly #api: API;
  readonly #sensor: Service;

  constructor(api: API, accessory: PlatformAccessory, target: Target) {
    this.#api = api;
    const { Service, Characteristic } = api.hap;
    accessory
      .getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, 'Connection Monitor')
      .setCharacteristic(Characteristic.Model, 'Ping')
      .setCharacteristic(Characteristic.SerialNumber, target.host);
    this.#sensor = accessory.getService(Service.OccupancySensor) ?? accessory.addService(Service.OccupancySensor, target.name);
    if (!this.#sensor.testCharacteristic(Characteristic.ConfiguredName)) {
      this.#sensor.addOptionalCharacteristic(Characteristic.ConfiguredName);
      this.#sensor.setCharacteristic(Characteristic.ConfiguredName, target.name);
    }
  }

  /** It answers or it does not. */
  set(answers: boolean): void {
    const { OccupancyDetected } = this.#api.hap.Characteristic;
    this.#sensor.updateCharacteristic(
      OccupancyDetected,
      answers ? OccupancyDetected.OCCUPANCY_DETECTED : OccupancyDetected.OCCUPANCY_NOT_DETECTED,
    );
  }
}
