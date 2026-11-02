/**
 * One target in HomeKit, as its settings choose: an occupancy sensor,
 * occupied while it answers — a phone come home, a NAS switched on, the
 * internet up — or a switch or an outlet, on while it answers. Either way it
 * turns off once a whole round of pings went unanswered. A switch or outlet
 * only shows: one switched in the Home app goes back.
 */
import type { API, PlatformAccessory, Service, WithUUID } from 'homebridge';

import type { Shown, Target } from './config.ts';

/** How long a switch someone tapped takes to go back. */
const BOUNCE_MS = 1000;

export class TargetAccessory {
  readonly #api: API;
  readonly #service: Service;
  readonly #shown: Exclude<Shown, 'none'>;
  #answers = false;

  constructor(api: API, accessory: PlatformAccessory, target: Target & { homekit: Exclude<Shown, 'none'> }) {
    this.#api = api;
    this.#shown = target.homekit;
    const { Service, Characteristic } = api.hap;
    accessory
      .getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, 'Connection Monitor')
      .setCharacteristic(Characteristic.Model, 'Ping')
      .setCharacteristic(Characteristic.SerialNumber, target.host);
    const types: Record<Exclude<Shown, 'none'>, WithUUID<typeof Service>> = {
      occupancy: Service.OccupancySensor,
      switch: Service.Switch,
      outlet: Service.Outlet,
    };
    // Shown another way before: that service goes, with its automations.
    for (const [shown, type] of Object.entries(types)) {
      const other = shown !== this.#shown && accessory.getService(type);
      if (other) {
        accessory.removeService(other);
      }
    }
    const type = types[this.#shown];
    this.#service = accessory.getService(type) ?? accessory.addService(new type(target.name, ''));
    if (!this.#service.testCharacteristic(Characteristic.ConfiguredName)) {
      this.#service.addOptionalCharacteristic(Characteristic.ConfiguredName);
      this.#service.setCharacteristic(Characteristic.ConfiguredName, target.name);
    }
    if (this.#shown !== 'occupancy') {
      this.#service.getCharacteristic(Characteristic.On).onSet(() => {
        setTimeout(() => this.#service.updateCharacteristic(Characteristic.On, this.#answers), BOUNCE_MS);
      });
    }
  }

  /** It answers or it does not. */
  set(answers: boolean): void {
    this.#answers = answers;
    const { OccupancyDetected, On, OutletInUse } = this.#api.hap.Characteristic;
    if (this.#shown === 'occupancy') {
      this.#service.updateCharacteristic(
        OccupancyDetected,
        answers ? OccupancyDetected.OCCUPANCY_DETECTED : OccupancyDetected.OCCUPANCY_NOT_DETECTED,
      );
      return;
    }
    this.#service.updateCharacteristic(On, answers);
    if (this.#shown === 'outlet') {
      this.#service.updateCharacteristic(OutletInUse, answers);
    }
  }
}
