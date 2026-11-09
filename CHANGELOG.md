# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [semantic versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Documentation

- **More ideas for automations**: who is home, something switched on or
  off, and the network, with what helps all of them.

## [2.0.6] — 2026-11-09

### Documentation

- The README tells of the other monitors in the family, and of Monitor
  Dashboard, which shows them all on one page.

## [2.0.5] — 2026-11-03

### Fixed

- `config.schema.json` is valid JSON Schema: a target's `name` and `host`
  are required by a `required` list on the target, not by `"required": true`
  on each field, which JSON Schema does not allow.

## [2.0.4] — 2026-11-03

### Fixed

- A request to the dashboard for a path that is no URL, such as `//`, no
  longer brings the bridge down; it is answered with an error instead.
- A target whose host begins with `-` is left out, with a warning, rather
  than handed to `ping`, which would read it as one of its options.
- The dashboard closes its open connections when Homebridge stops.

### Changed

- `ping` is looked for in `/bin`, `/sbin`, `/usr/bin` and `/usr/sbin`
  before the `PATH`, so it is found under service managers whose `PATH`
  lacks it. The `CONNECTION_MONITOR_PING` environment variable is gone:
  the plugin reads no environment variables.

## [2.0.3] — 2026-11-03

### Changed

- Dashboard, Home look: the smoke is dark instead of white, which looked
  like fog on the glass, and the loss colours of the median are brighter.

## [2.0.2] — 2026-11-02

### Changed

- The README shows the settings page, light and dark, and credits
  [Smokeping](https://oss.oetiker.ch/smokeping/) and Tobias Oetiker, whose
  idea and look it takes up.

## [2.0.1] — 2026-11-02

### Changed

- Cleaner code without change to what it does: the samples read from the
  database in one place, the figures of a tile — median, loss, fastest and
  slowest ping — made in one, and a `ping` that cannot run finishes its
  round once rather than twice.

## [2.0.0] — 2026-11-02

Connection Monitor is a Homebridge plugin now: **homebridge-connection-monitor**.

### Added

- Each device in HomeKit as an **occupancy sensor**, a **switch** or an
  **outlet**, as Appliance Monitor's Running, or not at all: occupied or on
  from the first ping that comes back, off once a whole round went
  unanswered.
- A settings page in the Homebridge UI, as Synology Monitor's: the devices,
  each a name, an IP address and how it is in HomeKit, and General with the link to the
  dashboard under its switch, how often, how many pings and how long what
  is kept.

### Changed

- A new icon: a router before a latency chart, with a magnifier on the
  network.
- The pings go out through the system's own `ping`, one per target, all at
  once: **fping is no longer needed**.
- The data is kept in `connection-monitor/connection-monitor.db` in
  Homebridge's storage folder, as Appliance Monitor keeps its own. See
  *Coming from Connection Monitor 1* in the README to take it over.
- Smokeping's history is taken over with `connection-monitor-import`, into
  Homebridge's storage folder; add the targets in the settings by the same
  names.
- No targets by default: they are set up in the settings.
- A target's icon is always guessed from its name and address; `icon` is
  no longer a setting.

### Removed

- The standalone service, `config.json`, `npm start` and the `fping` and
  `database` settings.

## [1.1.0] — 2026-10-27

### Changed

- The chart's ranges: 1 hour, 3, 12 or 24 hours, 7 or 30 days, or a year,
  in place of Smokeping's 3 hours, 30 hours, 10 days and a year; 24 hours
  first. A range in the address, as `#3h`, for a bookmark.

### Fixed

- A gap in the rounds, as while the machine restarts, was filled with
  Smokeping's hourly or twelve-hour averages; a range now takes nothing
  longer than a twelfth of it.

## [1.0.0] — 2026-10-27

The first release.

### Added

- Pings every target 20 times a minute with fping, as Smokeping's FPing probe,
  and keeps the rounds in SQLite: 30 days as they were, then by the hour for
  two years.
- A dashboard on port 8584 in the look of Appliance Monitor's and Synology
  Monitor's — Home, light and dark: a tile per target, and a chart per target
  over 3 hours, 30 hours, 10 days or a year, the median coloured by loss and
  the spread of the pings as smoke.
- `npm run import`: Smokeping's targets and its year of history, read from
  its RRDs through Perl's RRDs module.
- A systemd unit.

[Unreleased]: https://github.com/rummeyer/homebridge-connection-monitor/compare/v2.0.6...HEAD
[2.0.6]: https://github.com/rummeyer/homebridge-connection-monitor/compare/v2.0.5...v2.0.6
[2.0.5]: https://github.com/rummeyer/homebridge-connection-monitor/compare/v2.0.4...v2.0.5
[2.0.4]: https://github.com/rummeyer/homebridge-connection-monitor/compare/v2.0.3...v2.0.4
[2.0.3]: https://github.com/rummeyer/homebridge-connection-monitor/compare/v2.0.2...v2.0.3
[2.0.2]: https://github.com/rummeyer/homebridge-connection-monitor/compare/v2.0.1...v2.0.2
[2.0.1]: https://github.com/rummeyer/homebridge-connection-monitor/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/rummeyer/homebridge-connection-monitor/compare/v1.1.0...v2.0.0
[1.1.0]: https://github.com/rummeyer/homebridge-connection-monitor/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/rummeyer/homebridge-connection-monitor/releases/tag/v1.0.0
