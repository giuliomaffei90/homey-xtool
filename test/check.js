// Usage: node test/check.js [p2-ip]. Runs driver+device against the real P2 with a stubbed Homey SDK.
const Module = require('module');
const assert = require('assert');
const triggers = [];
const card = (id) => ({ registerRunListener(fn) { this.run = fn; return this; }, trigger: async (d, t, s) => triggers.push([id, t, s]) });
class Base { constructor() { this.homey = { flow: { getDeviceTriggerCard: card, getConditionCard: card }, setInterval: () => 0, clearInterval() {} }; } log(...a) { console.log(...a); } error(...a) { console.error(...a); } }
const orig = Module._load;
Module._load = (r, ...rest) => r === 'homey' ? { Driver: Base, Device: Base, App: Base } : orig(r, ...rest);

const dir = require('path').join(__dirname, '..');
const address = process.argv[2] || '192.168.86.43';
const Driver = require(dir + '/drivers/p2/driver.js');
const Device = require(dir + '/drivers/p2/device.js');
(async () => {
  const driver = new Driver(); await driver.onInit();
  const caps = { xtool_status: null };
  const dev = new Device();
  Object.assign(dev, { driver, getSetting: (k) => ({ address, poll_interval: 5 })[k], getCapabilityValue: (k) => caps[k] ?? null, setCapabilityValue: async (k, v) => { caps[k] = v; } });
  await dev.poll();
  console.log('caps', caps);
  assert.ok(caps.xtool_status, 'status read');
  assert.strictEqual(triggers.length, 0, 'no trigger on first reading');
  // simulate a transition to check triggers + run listeners
  await dev.updateStatus('working');
  assert.deepStrictEqual(triggers.map(t => t[0]), ['status_changed', 'status_became']);
  assert.strictEqual(await driver.statusBecame.run({ status: 'working' }, triggers[1][2]), true);
  // offline after repeated failures
  dev.getSetting = () => '192.168.86.254';
  for (let i = 0; i < 3; i++) await dev.poll();
  assert.strictEqual(caps.xtool_status, 'offline');
  // pairing handler
  let h; await driver.onPair({ setHandler: (n, f) => { h = f; } });
  console.log('pair', await h({ address: ` ${address} ` }));
  await assert.rejects(h({ address: 'x/../y' }));
  // replay of a real P2 job (mode/subMode as recorded from /device/runningStatus)
  const job = [['P_IDLE', ''], ['Work', 'workReady'], ['Work', 'working'], ['Work', 'workPause'], ['Work', 'working'], ['P_WORK_DONE', ''], ['P_IDLE', '']];
  const seen = [];
  const rcaps = { xtool_status: null };
  const replay = new Device();
  let step;
  Object.assign(replay, {
    driver: { ...driver, get: async (a, p) => (p === '/device/runningStatus' ? { curMode: { mode: step[0], subMode: step[1] } } : p === '/peripheral/gap' ? { state: 'off' } : { value: 50, total: 100 }) },
    getSetting: () => 'replay', getCapabilityValue: (k) => rcaps[k] ?? null, setCapabilityValue: async (k, v) => { rcaps[k] = v; },
  });
  for (step of job) { await replay.poll(); seen.push(rcaps.xtool_status); }
  assert.deepStrictEqual(seen, ['idle', 'ready', 'working', 'paused', 'working', 'finished', 'idle']);
  console.log('OK');
})().catch((e) => { console.error(e); process.exit(1); });
