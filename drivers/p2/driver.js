'use strict';

const Homey = require('homey');

class P2Driver extends Homey.Driver {

  async onInit() {
    this.statusChanged = this.homey.flow.getDeviceTriggerCard('status_changed');
    this.statusBecame = this.homey.flow.getDeviceTriggerCard('status_became')
      .registerRunListener(async (args, state) => args.status === state.status);
    this.homey.flow.getConditionCard('status_is')
      .registerRunListener(async (args) => args.device.getCapabilityValue('xtool_status') === args.status);
  }

  // GET a P2 REST endpoint and unwrap its {code, data, msg} envelope.
  async get(address, path) {
    const res = await fetch(`http://${address}:8080${path}`, { signal: AbortSignal.timeout(4000) });
    const body = await res.json();
    if (body.code !== 0) throw new Error(body.msg || `HTTP ${res.status}`);
    return body.data;
  }

  async onPair(session) {
    session.setHandler('connect', async ({ address }) => {
      address = String(address || '').trim();
      if (!/^[\w.-]+$/.test(address)) throw new Error('Invalid IP address');
      const info = await this.get(address, '/device/machineInfo');
      return {
        name: info.deviceName || `xTool ${info.machineType || 'P2'}`,
        data: { id: info.sn },
        settings: { address },
      };
    });
  }

}

module.exports = P2Driver;
