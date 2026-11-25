# Gecko in.touch2

Control a spa equipped with a Gecko controller and its **in.touch2** Wi-Fi
module from Gladys: water temperature, setpoint, pumps, blower, waterfall,
lights and water care mode.

The integration talks **directly to the in.touch2 module on your local
network** (UDP port 10022), like the official in.touch2 app does at home. No
cloud account, no password: the spa keeps working with Gladys even when the
internet is down.

## Requirements

- A spa with a Gecko controller (in.YT, in.XE, in.YJ, in.XM, in.YE…) and its
  in.touch2 module, already paired and working with the in.touch2 app.
- The in.touch2 module (the box plugged near your router) on the same local
  network as Gladys.
- Gladys 5.1 or later.

## Setup

1. Install the integration, then open its **Discovery** tab: the in.touch2
   modules of the network answer within a few seconds. Add your spa.
2. Not found? Give the in.touch2 module a fixed address in your router (DHCP
   reservation), type it in **in.touch2 module address** in the
   **Configuration** tab, save, and open the Discovery tab again.
3. **Search for spas** (Configuration tab) runs the same search and tells you
   what answered; **Test the connection** checks every known spa and shows the
   radio signal between the module and the spa.

## What you get

One device per spa, whose features depend on what is wired to your
controller:

| Feature            | Description                                                        |
| ------------------ | ------------------------------------------------------------------ |
| Water temperature  | Measured by the spa (°C, converted by Gladys if you use °F)        |
| Target temperature | The setpoint, adjustable within the range of your spa (15–40 °C)   |
| Heating            | Whether the heater is running                                      |
| Pump 1…5           | On/off (on = high speed)                                           |
| Blower, Waterfall  | On/off                                                             |
| Light, Light 2     | On/off                                                             |
| Circulation pump   | Read-only                                                          |
| Ozone              | Read-only                                                          |
| Water care mode    | Away, Standard, Energy saving, Super energy saving, Weekender      |
| Radio signal       | Quality of the radio link between the in.touch2 module and the spa |

The values are pushed by the spa as soon as they change: no polling.

## Scenes

Triggers:

- **Spa water at temperature** — the water reached the setpoint. The
  following actions can read `{{triggerEvent.data.temperature}}`.
- **Spa heating started or stopped** — filter on started and/or stopped.
- **Spa connection lost or back** — the in.touch2 module stopped answering,
  or answers again.

Actions:

- **Set the spa temperature** — returns the temperature actually applied.
- **Set the water care mode**.
- **Control a pump or a light** — off, low or high speed. Returns whether the
  spa has that equipment.
- **Stop the spa jets and lights** — returns how many were running.

## Dashboard

The **Spa overview** widget shows the water and target temperatures (live),
the heating, the water care mode and the connection, with buttons to toggle
the light, change the temperature and stop everything. With several spas,
pick one in the widget settings.

## Troubleshooting

- **Nothing is found** — the module answers broadcasts on UDP port 10022.
  Some routers or mesh systems filter them: type the module address in the
  configuration. Check that the official app works on the same Wi-Fi.
- **Unreachable** — the module does not answer anymore (power, Wi-Fi). The
  integration retries every minute.
- **Orange dot on the badge** — the module answers but its radio link with
  the spa is unstable: move the module closer to the spa.
- **Unsupported controller** — the logs name the platform and the memory map
  versions: open an issue on the project page with them.

Only one application can drive the spa at a time on some firmware versions:
if the official app loses its connection while Gladys is connected, that is
expected.
