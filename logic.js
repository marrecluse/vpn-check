/* Decision logic for the VPN check page. Pure functions, no DOM: tested with node (tests/test_logic.js). */
(function (root) {
  var STALE_MONITOR_S = 120;

  /**
   * net  : { internet: boolean }   - can this device reach the wider internet (probes to third-party hosts)?
   * srv  : { reachable: boolean, data: object|null, serverNow: number|null } - did the status endpoint answer?
   * returns { code, level: 'good'|'warn'|'bad', extra: string[] }
   */
  function decide(net, srv) {
    var extra = [];
    var internet = net.internet || srv.reachable;

    if (!internet && !srv.reachable) return { code: 'no_connection', level: 'bad', extra: extra };
    if (internet && !srv.reachable) return { code: 'server_unreachable', level: 'bad', extra: extra };

    var d = srv.data;
    if (!d || !d.server || !d.device) return { code: 'monitor_stale', level: 'warn', extra: extra };

    var nowS = srv.serverNow || Math.floor(Date.now() / 1000);
    if (nowS - d.generated_epoch > STALE_MONITOR_S) return { code: 'monitor_stale', level: 'warn', extra: extra };

    var failed = {};
    d.server.checks.forEach(function (c) { if (c.level === 'fail') failed[c.id] = true; });
    if (failed.wg_service || failed.wg_interface || failed.wg_port) return { code: 'vpn_service_down', level: 'bad', extra: extra };
    if (failed.internet_via_vpn) return { code: 'vpn_no_internet', level: 'bad', extra: extra };
    if (failed.disk) return { code: 'server_full', level: 'bad', extra: extra };
    if (d.server.level === 'warn') extra.push('server_strain');

    switch (d.device.status) {
      case 'connected': return { code: 'ok', level: 'good', extra: extra };
      case 'idle':      return { code: 'idle', level: 'good', extra: extra };
      case 'stale':     return { code: 'device_off', level: 'warn', extra: extra };
      case 'never':     return { code: 'device_never', level: 'warn', extra: extra };
      default:          return { code: 'monitor_stale', level: 'warn', extra: extra };
    }
  }

  function ageText(s) {
    if (s === null || s === undefined) return 'never';
    if (s < 90) return s + ' s ago';
    if (s < 5400) return Math.round(s / 60) + ' min ago';
    if (s < 172800) return Math.round(s / 3600) + ' h ago';
    return Math.round(s / 86400) + ' days ago';
  }

  function buildReport(result, net, srv, now) {
    var lines = ['VPN check report', 'Time: ' + now.toISOString(), 'Result: ' + result.code + ' (' + result.level + ')',
      'Device internet: ' + (net.internet ? 'works' : 'not working'),
      'Server status page: ' + (srv.reachable ? 'reachable' : 'NOT reachable')];
    var d = srv.data;
    if (srv.reachable && d && d.device) {
      lines.push('Device: ' + d.device.name + ', last contact with server: ' + ageText(d.device.handshake_age_s) + ' (' + d.device.status + ')');
      lines.push('Server health: ' + d.server.level);
      d.server.checks.forEach(function (c) { if (c.level !== 'ok') lines.push('  - ' + c.title + ': ' + c.detail); });
      lines.push('Server up for: ' + Math.round(d.server.boot_age_s / 60) + ' min');
    }
    return lines.join('\n');
  }

  var api = { decide: decide, buildReport: buildReport, ageText: ageText, STALE_MONITOR_S: STALE_MONITOR_S };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.VpnLogic = api;
})(typeof self !== 'undefined' ? self : this);
