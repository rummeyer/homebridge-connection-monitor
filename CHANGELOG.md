# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [semantic versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/rummeyer/homebridge-connection-monitor/compare/v2.0.1...HEAD
[2.0.1]: https://github.com/rummeyer/homebridge-connection-monitor/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/rummeyer/homebridge-connection-monitor/compare/v1.1.0...v2.0.0
[1.1.0]: https://github.com/rummeyer/homebridge-connection-monitor/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/rummeyer/homebridge-connection-monitor/releases/tag/v1.0.0
