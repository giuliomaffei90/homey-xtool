<p align="center">
  <img src="docs/icon.png" width="128" alt="xTool P2 icon">
</p>

<h1 align="center">xTool P2</h1>

<p align="center">
  A Homey Pro app that triggers flows from the status of an xTool P2 laser.<br>
  Built with the <a href="https://apps.developer.homey.app/">Homey Apps SDK v3</a>, it reads the laser's local REST API: no cloud involved.
</p>

## Features

- **Laser status**: the device shows the current status of the laser: Offline, Booting, Sleeping, Idle, Ready to start, Framing, Measuring, Working, Paused, Finished, Error or Updating firmware.
- **"Status changed" trigger**: runs on every status change, with the tokens Status and Previous status. Tokens hold the status ID, such as `working` or `finished`.
- **"Status became..." trigger**: runs when the laser enters the status you pick, for example Finished to switch on a light when a job is done.
- **"Status is..." condition**: checks the current status, also inverted ("isn't").
- **Progress**: the job progress in percent while the laser is working or paused.
- **Lid open**: a contact alarm that follows the lid, so Homey's own contact alarm cards work with it.
- **Offline detection**: the status becomes Offline when the laser stops answering, for example when it is switched off.
- **Local pairing**: you add the laser by its IP address. The device settings hold the IP address and the poll interval (2 to 60 seconds, 5 by default).

## Requirements

- A Homey Pro (the app runs on the local platform only) with Homey 12.11.0 or later.
- An xTool P2 on the same network, on a firmware that still serves the REST API on port 8080. Tested with firmware `40.21.023`.
- Node.js and the Homey CLI, to install the app from source:

```bash
npm install -g homey
```

The CLI builds the app and installs it on your Homey over the network.

## Installation

```bash
git clone https://github.com/giuliomaffei90/homey-xtool.git
cd homey-xtool
homey login
homey app install
```

`homey app install` merges the files in [.homeycompose](.homeycompose) and the driver's `*.compose.json` files into `app.json`, validates the app, packs it and installs it on the Homey you select. The app has no npm dependencies.

Then, in the Homey app, add a device, choose **xTool P2** and enter the laser's IP address. Reserve that address in your router's DHCP settings: the app does not look for the laser again if its address changes.

For development, `homey app run` installs the app in development mode and streams its logs to the terminal. [test/check.js](test/check.js) runs the driver against a real laser with a stubbed Homey SDK and replays a recorded job:

```bash
node test/check.js 192.168.1.50
```

## How it works

1. During pairing, [pair/address.html](drivers/p2/pair/address.html) sends the IP address to [driver.js](drivers/p2/driver.js), which calls `GET http://<ip>:8080/device/machineInfo`. The laser's serial number becomes the device ID and its name becomes the device name.
2. [device.js](drivers/p2/device.js) polls the laser every poll interval, calling `/device/runningStatus`, `/peripheral/gap` and `/processing/progress` in parallel. Every reply is a `{code, data, msg}` envelope; `driver.js` unwraps `data` and throws when `code` is not 0.
3. The status comes from `curMode.mode` in `/device/runningStatus`. While a job runs, the P2 reports `mode: "Work"` and puts the phase in `subMode` (`workReady`, `working`, `workPause`), so the app reads `subMode` in that case. The `MODES` table in `device.js` maps both kinds of codes to the statuses above.
4. The lid is open when `/peripheral/gap` returns `state: "on"`. Progress is `value / total` from `/processing/progress`, and is cleared outside of a job.
5. When the status changes, the device updates its status and fires the "Status changed" and "Status became..." triggers. The first reading after the app starts does not fire them, because it is not a real change.
6. After 3 failed polls in a row, the status becomes Offline.

## Known limitations

- Only the REST API is supported. xTool is moving its lasers to a newer firmware that talks over an encrypted WebSocket on port 28900; a P2 on that firmware will not work with this app.
- Finished lasts about 9 seconds on the P2 before it goes back to Idle. With a poll interval above 5 seconds the app can miss it, and then the "Status became Finished" trigger does not run.
- Framing, Measuring and Error come from the protocol notes of other integrations and have not been seen on a real P2 yet.
- The app only reads the laser: there are no action cards.
- Alarms reported by the laser (`curAlarmInfo`) are not read.
- The number of failed polls before Offline is fixed at 3 in `device.js`.

## Legal note

This project is not affiliated with or endorsed by xTool. The xTool name, logo and product photo belong to xTool. The local API is undocumented; the endpoints used here were worked out by the Home Assistant integrations [ha-xtool](https://github.com/thecodingdad/ha-xtool) and [BassXT/xtool](https://github.com/BassXT/xtool).
