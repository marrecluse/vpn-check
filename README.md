# VPN Check

A tiny status page for a family WireGuard VPN. It tells a non-technical user **why** the VPN is not working,
in plain English, and still opens when the VPN has blocked their internet.

Live at `https://marrecluse.net/vpn-check/?k=<private code>`. The private code is per device and is never stored in this repository.

## How it works

* **The page** (`index.html`, `logic.js`) is hosted on GitHub Pages, **not** on the VPN server, so it survives the server going down.
* **A service worker** (`sw.js`) caches the page, so once opened it still loads when a full-tunnel VPN blackholes the internet.
* **The server** runs `server/vpn-health-collect` every 15 s (systemd timer). It writes one small JSON file per device
  (`/s/<random 128-bit token>.json`) containing only: a device label, handshake age, byte counts and health checks
  (VPN service, interface, port, forwarding/NAT, disk, memory, load). No keys, IP addresses or endpoints.
* **nginx** (`server/vpncheck.nginx.conf`) serves those files read-only, with CORS limited to `https://marrecluse.net`.
* **The browser** checks (1) can this device reach the internet, (2) can it reach the status file, then combines both
  with the server's own checks (`logic.js`, tested with `node tests/test_logic.js`).

## Why "switch the VPN off" is part of the advice
With a full-tunnel config (`AllowedIPs = 0.0.0.0/0`) a dead VPN server takes the user's *whole* internet down with it.
If neither the internet nor the status file can be reached, the page tells the user to switch the VPN off and check again:
if things work with the VPN off, the server is the problem.

## Test every situation without breaking anything
Append `&demo=<state>` to the URL: `ok`, `idle`, `device_off`, `device_never`, `no_connection`, `server_unreachable`,
`vpn_service_down`, `vpn_no_internet`, `server_full`, `monitor_stale`, `strain`. Demo mode is clearly labelled.

## Limits (honest)
* A WireGuard handshake only happens while traffic flows, so "idle" can simply mean nothing was sent recently.
* The page cannot see the user's WireGuard app; it infers the device state from the server's last handshake.
* If the status file is stale (> 2 min) the page says so instead of trusting it.
