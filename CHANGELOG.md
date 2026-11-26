# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [2.0.0] - 2026-11-26

## [1.0.0] - 2026-11-25

### Added

- Local control of Gecko spas through their in.touch2 module (UDP port 10022,
  no cloud account): discovery through the Gladys network scan or at a typed
  address, and live updates pushed by the spa.
- One device per spa: water temperature, target temperature, heating, pumps,
  blower, waterfall, lights, circulation pump, ozone, water care mode and radio
  signal, depending on the equipment wired to the controller.
- Support of the in.YT, in.XE, in.YJ, in.XM and in.YE controller families
  (memory maps extracted from geckolib).
- Scene triggers: water at temperature, heating started or stopped, connection
  lost or back.
- Scene actions: set the temperature, set the water care mode, control a pump
  or a light, stop the jets and lights.
- "Spa overview" dashboard widget: live temperatures, heating, water care mode,
  connection, and buttons for the light, the temperature and a quick stop.
- Configuration screen actions: search for spas, test the connection, identify
  a spa (its light blinks).
- Interface and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/gboulvin/Gladys-Gecko-inTouch2/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/gboulvin/Gladys-Gecko-inTouch2/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/gboulvin/Gladys-Gecko-inTouch2/releases/tag/v1.0.0
