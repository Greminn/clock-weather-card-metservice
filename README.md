# Clock Weather Card (MetService)

[![HACS](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://github.com/hacs/integration)

> **A fork of [`pkissling/clock-weather-card`](https://github.com/pkissling/clock-weather-card).**
> All the credit for the card belongs to [Patrick Kissling](https://github.com/pkissling) and its
> contributors, and to [basmilius](https://github.com/basmilius) for the
> [weather icons](https://github.com/basmilius/weather-icons). This fork exists only to make the
> weather icons match how [MetService](https://www.metservice.com/) (New Zealand) categorises the
> weather — MetService distinguishes conditions such as **few showers** (sun + cloud + rain) that
> Home Assistant's fixed `weather` condition set can't represent, so the stock card shows plain
> rain instead.
>
> **Not affiliated with, or endorsed by, the Meteorological Service of New Zealand.** This card
> contains no MetService content — it maps the condition *labels* that arrive as Home Assistant
> entities (via the third-party [`metservice-weather`](https://github.com/nagelm/metservice-weather)
> integration) to the [Meteocons](https://github.com/basmilius/weather-icons) icon set bundled with
> the upstream card.

## What's different from upstream

- The card is registered as `custom:clock-weather-card-metservice` (and ships as
  `clock-weather-card-metservice.js`), so it installs alongside the original without clashing.
- **`condition_entity`** (see [Options](#options)) — when set, the today icon and the forecast-row
  icons are chosen from MetService's raw, un-mapped condition token instead of Home Assistant's
  collapsed `weather` condition. `few-showers` → sun-shower icon, `showers`/`rain` → heavier rain,
  and so on. Without it the card behaves exactly like upstream.

The raw tokens come from the [`metservice-weather`](https://github.com/nagelm/metservice-weather)
integration. A first-class `sensor.<location>_condition` for this is requested in
[nagelm/metservice-weather#33](https://github.com/nagelm/metservice-weather/issues/33); until it
lands you can feed `condition_entity` a template sensor built from the integration's existing
`*_condition_morning/afternoon/evening/overnight` and `*_condition_tomorrow` sensors.

Everything else tracks upstream — for the base card, its options and its issues, see
[`pkissling/clock-weather-card`](https://github.com/pkissling/clock-weather-card).

### MetService condition → icon

MetService's condition tokens (as delivered by `metservice-weather`) and the
[Meteocons](https://github.com/basmilius/weather-icons) icon each currently maps to. Browse the
full icon set at [meteocons.com](https://meteocons.com). Mapping lives in
[`src/metservice-icons.ts`](src/metservice-icons.ts).

Icons shown in the **line** style (day variant where day/night differ).

| MetService token | MetService icon | Meteocons icon | Day | Night |
|---|---|---|:--:|:--:|
| `fine` | Sun | `clear-day` / `clear-night` | <img src="src/icons/line/png/128/clear-day.png" width="36"> | <img src="src/icons/line/png/128/clear-night.png" width="36"> |
| `partly-cloudy` | Sun with some cloud | `partly-cloudy-day` / `-night` | <img src="src/icons/line/png/128/partly-cloudy-day.png" width="36"> | <img src="src/icons/line/png/128/partly-cloudy-night.png" width="36"> |
| `mostly-cloudy` | Cloud with a little sun | `cloudy` | <img src="src/icons/line/png/128/cloudy.png" width="36"> | |
| `cloudy` | Full cloud | `cloudy` | <img src="src/icons/line/png/128/cloudy.png" width="36"> | |
| `few-showers` | Sun, cloud, light rain | `partly-cloudy-day-rain` / `-night-rain` | <img src="src/icons/line/png/128/partly-cloudy-day-rain.png" width="36"> | <img src="src/icons/line/png/128/partly-cloudy-night-rain.png" width="36"> |
| `showers` | Cloud with rain | `rain` | <img src="src/icons/line/png/128/rain.png" width="36"> | |
| `drizzle` | Cloud with fine drizzle | `partly-cloudy-day-rain` / `-night-rain` | <img src="src/icons/line/png/128/partly-cloudy-day-rain.png" width="36"> | <img src="src/icons/line/png/128/partly-cloudy-night-rain.png" width="36"> |
| `rain` | Cloud with steady rain | `rain` | <img src="src/icons/line/png/128/rain.png" width="36"> | |
| `wind-rain` / `rain-wind` | Rain with wind | `rain` | <img src="src/icons/line/png/128/rain.png" width="36"> | |
| `thunder` | Cloud with lightning | `thunderstorms-day` / `-night` | <img src="src/icons/line/png/128/thunderstorms-day.png" width="36"> | <img src="src/icons/line/png/128/thunderstorms-night.png" width="36"> |
| `hail` | Cloud with hail | `hail` | <img src="src/icons/line/png/128/hail.png" width="36"> | |
| `snow` | Cloud with snow | `snow` | <img src="src/icons/line/png/128/snow.png" width="36"> | |
| `windy` | Wind | `windsock` | <img src="src/icons/line/png/128/windsock.png" width="36"> | |
| `fog` | Fog | `fog-day` / `fog-night` | <img src="src/icons/line/png/128/fog-day.png" width="36"> | <img src="src/icons/line/png/128/fog-night.png" width="36"> |
| `frost` | Frost | `clear-night` | <img src="src/icons/line/png/128/clear-night.png" width="36"> | |

A trailing `-night` on a token is tolerated (the current-conditions feed can emit `few-showers-night`
etc.). An unknown token falls back to the stock Home-Assistant-condition icon.

> **Work in progress** — these are first-pass choices, still being tuned against how MetService
> actually draws each condition. `showers`/`drizzle`/`rain` in particular currently render similarly.

---

A [Home Assistant Dashboard Card](https://www.home-assistant.io/dashboards/) showing the current
date, time and a weather forecast.

![Clock Weather Card](.github/assets/card.gif)
[^1]

## What does the card actually display?

![image](https://user-images.githubusercontent.com/33731393/221779555-c2c25e12-4ff0-4c61-8fd7-94d5b1b214d3.png)

The bars represent the temperature range for a given day.
In the above image, the 9° on Thursday represents the low across all of the forecast days and the 21° represents the highs (i.e. all bars are from 9° to 21°).
The colored portion of the bar represents the range of temperatures that are forecast for that day (so 12° to 21° on Monday).
The circle represents the current temperature (16° or roughly midway between 12° and 21° in your case).

_Thanks to @deprecatedcoder for this text from [pkissling/clock-weather-card#143](https://github.com/pkissling/clock-weather-card/issues/143)_

The basic idea of the forecast bars is to be able to understand the weather trend for the upcoming days in a single glance.

## Installation

### HACS (custom repository)

1. Make sure [HACS](https://hacs.xyz) is installed.
2. HACS → ⋮ → **Custom repositories** → add `https://github.com/Greminn/clock-weather-card-metservice`, category **Dashboard** (a.k.a. Lovelace / plugin).
3. Find **Clock Weather Card (MetService)** in HACS and install it.
4. Add the Lovelace resource (HACS usually does this for you):

   ```yaml
   resources:
     - url: /hacsfiles/clock-weather-card-metservice/clock-weather-card-metservice.js
       type: module
   ```

5. Restart Home Assistant, then add the card to a dashboard.

### Manual

1. Download `clock-weather-card-metservice.js` from the [latest release](https://github.com/Greminn/clock-weather-card-metservice/releases/latest).
2. Place it in `config/www/`.
3. Add the resource:

   ```yaml
   resources:
     - url: /local/clock-weather-card-metservice.js
       type: module
   ```

## Configuration

### Minimal configuration

```yaml
type: custom:clock-weather-card-metservice
entity: weather.home  # replace with your weather provider's entity id
```

### Full configuration

```yaml
type: custom:clock-weather-card-metservice
entity: weather.home  # replace with your weather provider's entity id
condition_entity: sensor.home_metservice_conditions  # MetService raw-condition source (optional)
title: Home
sun_entity: sun.sun
temperature_sensor: sensor.outdoor_temp
humidity_sensor: sensor.outdoor_humidity
weather_icon_type: line
animated_icon: true
forecast_rows: 5
locale: en-GB
time_pattern: HH:mm
time_format: 24
date_pattern: ccc, d.MM.yy
hide_today_section: false
hide_forecast_section: false
show_humidity: false
hide_clock: false
hide_date: false
hourly_forecast: false
use_browser_time: false
time_zone: null
show_decimal: false
apparent_sensor: sensor.real_feel_temperature
aqi_sensor: sensor.air_quality_index
```

### Options

| Name                  | Type             | Requirement  | Description                                                                                                                                                                                                                       | Default   |
| --------------------- | ---------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| type                  | string           | **Required** | `custom:clock-weather-card-metservice`                                                                                                                                                                                            |           |
| entity                | string           | **Required** | ID of the weather entity                                                                                                                                                                                                          |           |
| condition_entity      | string           | **Optional** | ID of an entity supplying MetService's raw condition token(s). Its **state** sets the today icon; its optional **`forecast`** attribute — a list of `{ date, condition }` — sets the forecast-row icons (rows with no match fall back to the `entity` weather condition). Unset ⇒ card behaves like upstream. | `''` |
| title                 | string           | **Optional** | Title of the card                                                                                                                                                                                                                 | `''`      |
| sun_entity            | boolean          | **Optional** | ID of the sun entity. Used to determine whether to show a day or night icon. If sun integration is not enabled, day icon will be shown                                                                                            | `sun.sun` |
| temperature_sensor    | string           | **Optional** | ID of the temperature sensor entity. Used to show the current temperature based on a sensor value instead of the weather forecast                                                                                                 | `''`      |
| humidity_sensor       | string           | **Optional** | ID of the humidity sensor entity. Used to show the current humidity based on a sensor value, if `show_humidity` is set to `true`                                                                                                  | `''`      |
| weather_icon_type     | `line` \| `fill` | **Optional** | Appearance of the large weather icon                                                                                                                                                                                              | `line`    |
| animated_icon         | boolean          | **Optional** | Whether the large weather icon should be animated                                                                                                                                                                                 | `true`    |
| forecast_rows         | number           | **Optional** | The amount of weather forecast rows to show. Depending on `hourly_forecast` each row either corresponds to a day or an hour                                                                                                       | `5`       |
| locale                | string[^2]       | **Optional** | Language to use for language specific text and date/time formatting. If not provided, falls back to the locale set in HA or, if not set in HA, to `en-GB`                                                                         | `en-GB`   |
| time_format           | `24` \| `12`     | **Optional** | Format used to display the time. If not provided, falls back to the default time format of the configured `locale`.  This option is ignored if `time_pattern` is set.                                                             | `24`      |
| time_pattern          | string           | **Optional** | Pattern to use for time formatting. See [luxon](https://moment.github.io/luxon/#/formatting?id=table-of-tokens) for valid tokens. If not provided, falls back to time_format option.                                              | `null`    |
| date_pattern          | string           | **Optional** | Pattern to use for date formatting. If not provided, falls back to a localized default date formatting. See [luxon](https://moment.github.io/luxon/#/formatting?id=table-of-tokens) for valid tokens                              | `D`       |
| show_humidity         | boolean          | **Optional** | Shows the humidity in the today section. Reads the value from `humidity_sensor`, if provided, otherwise from the `humidity` attribute of the configured weather `entity`                                                           | `false`   |
| hide_today_section    | boolean          | **Optional** | Hides the cards today section (upper section), containing the large weather icon, clock and current date                                                                                                                          | `false`   |
| hide_forecast_section | boolean          | **Optional** | Hides the cards forecast section (lower section),containing the weather forecast                                                                                                                                                  | `false`   |
| hide_clock            | boolean          | **Optional** | Hides the clock from the today section and prominently displays the current temperature instead                                                                                                                                   | `false`   |
| hide_date             | boolean          | **Optional** | Hides the date from the today section                                                                                                                                                                                             | `false`   |
| hourly_forecast       | boolean          | **Optional** | Displays an hourly forecast instead of daily                                                                                                                                                                                      | `false`   |
| use_browser_time      | boolean          | **Optional** | Uses the time from your browser to indicate the current time. If not provided, uses the [time_zone](https://www.home-assistant.io/blog/2015/05/09/utc-time-zone-awareness/#setting-up-your-time-zone) configured in HA            | `false`   |
| time_zone             | string           | **Optional** | Uses the given [time zone](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) to indicate the current date and time. If not provided, uses the time zone configured in HA                                              | `null`    |
| show_decimal          | boolean          | **Optional** | Displays main temperature without rounding                                                                                                                                                                                        | `false`   |
| apparent_sensor       | string           | **Optional** | ID of the apparent temperature sensor entity. It is used to show the apparent temperature based on a sensor and will only show it if value is provided.                                                                           | `''`      |
| aqi_sensor            | string           | **Optional** | ID of the Air Quality Index sensor entity. It is used to show the AQI based on a sensor and will only show it if value is provided.                                                                           | `''`      |

## Migrating from upstream `clock-weather-card`

Change `type: custom:clock-weather-card` to `type: custom:clock-weather-card-metservice`. Every
other option is unchanged. You can keep both cards installed.

## FAQ

### Why don't I see the current day in my weather forecast?

Your weather provider may not provide today's weather as part of their forecast. `metservice-weather`
and [Open Meteo](https://www.home-assistant.io/integrations/open_meteo/) both include today.

## Footnotes

[^1]: Theme used: [lovelace-ios-themes](https://github.com/basnijholt/lovelace-ios-themes).
[^2]: Supported languages: `ar`, `bg`, `ca`, `cs`, `cy`, `da`, `de`, `el`,`en`, `es`, `et`, `fi`, `fr`, `he`, `hu`, `hr`, `id`, `is`, `it`, `ja`, `ko`, `lb`, `lt`, `nb`, `nl`, `pl`, `pt`, `pt-BR`, `ro`, `ru`, `sk`, `sl`, `sr`, `sr-Latn`, `sv`, `th`, `tr`, `uk`, `ur`, `vi`, `zh-CN`, `zh-TW`
