const assert = require('assert');
const { decide, buildReport } = require('../logic.js');

const NOW = 1_800_000_000;
const okChecks = () => [
  { id: 'wg_service', level: 'ok', title: 'VPN service', detail: 'running' },
  { id: 'wg_interface', level: 'ok', title: 'VPN network interface', detail: 'up' },
  { id: 'wg_port', level: 'ok', title: 'VPN port', detail: 'listening' },
  { id: 'internet_via_vpn', level: 'ok', title: 'Internet through the VPN', detail: 'ok' },
  { id: 'disk', level: 'ok', title: 'Server disk', detail: '50% used' },
];
const payload = (over = {}) => ({
  generated_epoch: NOW - 5,
  server: { level: 'ok', checks: okChecks(), boot_age_s: 90000 },
  device: { name: 'father', status: 'connected', handshake_age_s: 30 },
  ...over,
});
const reach = (data) => ({ reachable: true, data, serverNow: NOW });
const run = (net, srv) => decide({ internet: net }, srv).code;
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok -', name); };

t('everything fine', () => assert.strictEqual(run(true, reach(payload())), 'ok'));
t('idle device is still good', () => {
  const r = decide({ internet: true }, reach(payload({ device: { name: 'father', status: 'idle', handshake_age_s: 400 } })));
  assert.deepStrictEqual([r.code, r.level], ['idle', 'good']);
});
t('device switched off (stale handshake)', () => assert.strictEqual(
  run(true, reach(payload({ device: { name: 'father', status: 'stale', handshake_age_s: 7200 } }))), 'device_off'));
t('device never connected', () => assert.strictEqual(
  run(true, reach(payload({ device: { name: 'x', status: 'never', handshake_age_s: null } }))), 'device_never'));
t('no internet and server unreachable (VPN on + server dead, or offline)', () =>
  assert.strictEqual(run(false, { reachable: false, data: null }), 'no_connection'));
t('internet fine but server unreachable = server down', () =>
  assert.strictEqual(run(true, { reachable: false, data: null }), 'server_unreachable'));
t('internet probes blocked but server answers is treated as online', () =>
  assert.strictEqual(run(false, reach(payload())), 'ok'));
t('wireguard service stopped', () => {
  const p = payload(); p.server.checks[0] = { id: 'wg_service', level: 'fail', title: 'VPN service', detail: 'STOPPED' }; p.server.level = 'fail';
  assert.strictEqual(run(true, reach(p)), 'vpn_service_down');
});
t('port not listening counts as service down', () => {
  const p = payload(); p.server.checks[2].level = 'fail'; p.server.level = 'fail';
  assert.strictEqual(run(true, reach(p)), 'vpn_service_down');
});
t('NAT/forwarding missing', () => {
  const p = payload(); p.server.checks[3].level = 'fail'; p.server.level = 'fail';
  assert.strictEqual(run(true, reach(p)), 'vpn_no_internet');
});
t('disk full', () => {
  const p = payload(); p.server.checks[4].level = 'fail'; p.server.level = 'fail';
  assert.strictEqual(run(true, reach(p)), 'server_full');
});
t('stale monitor data is flagged, never trusted', () => assert.strictEqual(
  run(true, reach(payload({ generated_epoch: NOW - 500 }))), 'monitor_stale'));
t('garbage payload does not crash', () => assert.strictEqual(run(true, reach({})), 'monitor_stale'));
t('server strain adds a warning but keeps the device verdict', () => {
  const p = payload(); p.server.level = 'warn';
  const r = decide({ internet: true }, reach(p));
  assert.deepStrictEqual([r.code, r.extra], ['ok', ['server_strain']]);
});
t('report contains the facts Abdul needs and no secrets', () => {
  const p = payload({ device: { name: 'father', status: 'stale', handshake_age_s: 7200 } });
  const res = decide({ internet: true }, reach(p));
  const rep = buildReport(res, { internet: true }, reach(p), new Date(NOW * 1000));
  assert.ok(rep.includes('device_off') && rep.includes('father') && rep.includes('2 h ago'));
  assert.ok(!/key|token|http/i.test(rep.replace('VPN check report', '')));
});
console.log(`\n${n} logic tests passed`);
