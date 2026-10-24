'use strict';

const Homey = require('homey');

// /device/runningStatus curMode.mode -> xtool_status.
// For mode "Work" the P2 puts the real phase in subMode, so subMode is the key.
const MODES = {
  workReady: 'ready',
  working: 'working',
  workPause: 'paused',
  P_BOOT: 'booting',
  P_SLEEP: 'sleeping',
  P_IDLE: 'idle',
  P_WORK: 'idle',
  P_READY: 'ready',
  P_ONLINE_READY_WORK: 'ready',
  P_OFFLINE_READY_WORK: 'ready',
  P_FRAMING: 'framing',
  P_FRAME_READY: 'framing',
  P_MEASURE: 'measuring',
  P_WORKING: 'working',
  P_PAUSE: 'paused',
  P_WORK_DONE: 'finished',
  P_FINISH: 'finished',
  P_ERROR: 'error',
  P_UPGRADE: 'upgrading',
};

// ponytail: tolerate a few missed polls before reporting offline, tune if Wi-Fi is flaky
const FAILURES_BEFORE_OFFLINE = 3;

class P2Device extends Homey.Device {

  async onInit() {
    this.failures = 0;
    this.startPolling(this.getSetting('poll_interval'));
  }

  async onSettings({ newSettings }) {
    this.startPolling(newSettings.poll_interval);
  }

  onDeleted() {
    this.homey.clearInterval(this.timer);
  }

  startPolling(seconds) {
    this.homey.clearInterval(this.timer);
    this.timer = this.homey.setInterval(() => this.poll(), seconds * 1000);
    this.poll();
  }

  async poll() {
    if (this.polling) return;
    this.polling = true;
    try {
      const address = this.getSetting('address');
      const get = (path) => this.driver.get(address, path);
      const [running, gap, progress] = await Promise.all([
        get('/device/runningStatus'),
        get('/peripheral/gap'),
        get('/processing/progress'),
      ]);
      this.failures = 0;

      const { mode, subMode } = running.curMode || {};
      const key = mode === 'Work' ? subMode : mode;
      if (key !== this.lastKey) this.log('Mode', mode, subMode);
      this.lastKey = key;
      if (!MODES[key]) this.log('Unknown mode', mode, subMode);
      const status = MODES[key] || this.getCapabilityValue('xtool_status');
      const active = status === 'working' || status === 'paused';

      // gap "on" = lid open (verified on a P2)
      await this.setCapabilityValue('alarm_contact', gap.state === 'on');
      await this.setCapabilityValue('progress', active && progress.total ? Math.round((progress.value * 100) / progress.total) : null);
      await this.updateStatus(status);
    } catch (err) {
      this.failures++;
      this.log('Poll failed', err.message);
      if (this.failures >= FAILURES_BEFORE_OFFLINE) await this.updateStatus('offline').catch(this.error);
    } finally {
      this.polling = false;
    }
  }

  async updateStatus(status) {
    const previous = this.getCapabilityValue('xtool_status');
    if (!status || status === previous) return;
    await this.setCapabilityValue('xtool_status', status);
    this.log('Status', previous, '->', status);
    // Skip the first reading after (re)start: it isn't a real transition.
    if (previous === null) return;
    await this.driver.statusChanged.trigger(this, { status, previous }).catch(this.error);
    await this.driver.statusBecame.trigger(this, {}, { status }).catch(this.error);
  }

}

module.exports = P2Device;
