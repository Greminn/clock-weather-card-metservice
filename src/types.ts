import { type LovelaceCard, type LovelaceCardConfig, type LovelaceCardEditor } from 'custom-card-helpers'
import { type HassEntity } from 'home-assistant-js-websocket/dist/types.js'
import { type DateTime } from 'luxon'

declare global {
  interface HTMLElementTagNameMap {
    'clock-weather-card-metservice-editor': LovelaceCardEditor
    'hui-error-card': LovelaceCard
  }
}

export interface ClockWeatherCardConfig extends LovelaceCardConfig {
  entity: string
  title?: string
  // MetService fork: an entity whose state is MetService's raw (un-mapped)
  // condition token for the current conditions, and whose optional `forecast`
  // attribute is a list of `{ date, condition }` for the forecast rows. Icons
  // for the today section and any matching forecast row are then resolved from
  // the raw token instead of Home Assistant's collapsed `weather` condition.
  // MetService fork: show the te reo Māori day name alongside the English one
  // in the date line, e.g. "Monday/Rāhina, 31 August 2026".
  maori_day_names?: boolean
  condition_entity?: string
  // MetService fork: an entity whose state is a plain-English forecast summary
  // (e.g. sensor.<location>_weather_description) shown as a line under the today
  // section. Uses the `full_description` attribute when the state is truncated.
  description_entity?: string
  // MetService fork: a compact "today, part by part" row (morning/afternoon/
  // evening/overnight) from the integration's `*_condition_<part>` sensors —
  // each entity's state is a raw MetService token, icon-mapped like the forecast.
  today_breakdown?: string[]
  // MetService fork: an optional tide section from the integration's marine
  // sensors.
  //  - tide_entity: a sensor with a `tide_table` attribute (the integration's
  //    `<region> Tide direction` sensor) -> a MetService-style tide curve.
  //  - tide_high_entity / tide_low_entity: next-high / next-low timestamp
  //    sensors -> a compact two-cell "next tide" row (used when tide_entity
  //    is not set).
  tide_entity?: string
  tide_high_entity?: string
  tide_low_entity?: string
  // MetService fork: embed a page (e.g. a Windy map at /local/windy.html) in
  // its own row, above the tide section. iframe_height accepts a number (px)
  // or any CSS length.
  iframe_url?: string
  iframe_height?: string | number
  sun_entity?: string
  temperature_sensor?: string
  humidity_sensor?: string
  weather_icon_type?: 'fill' | 'line'
  animated_icon?: boolean
  forecast_rows?: number
  locale?: string
  time_format?: '12' | '24'
  time_pattern?: string
  date_pattern?: string
  hide_today_section?: boolean
  hide_forecast_section?: boolean
  show_humidity?: boolean
  hourly_forecast?: boolean
  hide_clock?: boolean
  hide_date?: boolean
  use_browser_time?: boolean
  time_zone?: string
  show_decimal?: boolean
  apparent_sensor?: string
  aqi_sensor?: string
}

export interface MergedClockWeatherCardConfig extends LovelaceCardConfig {
  entity: string
  title?: string
  maori_day_names?: boolean
  condition_entity?: string
  description_entity?: string
  today_breakdown?: string[]
  tide_entity?: string
  tide_high_entity?: string
  tide_low_entity?: string
  iframe_url?: string
  iframe_height?: string | number
  sun_entity: string
  temperature_sensor?: string
  humidity_sensor?: string
  weather_icon_type: 'fill' | 'line'
  animated_icon: boolean
  forecast_rows: number
  locale?: string
  time_format?: '12' | '24'
  time_pattern?: string
  date_pattern: string
  hide_today_section: boolean
  hide_forecast_section: boolean
  show_humidity: boolean
  hourly_forecast: boolean
  hide_clock: boolean
  hide_date: boolean
  use_browser_time: boolean
  time_zone?: string
  show_decimal: boolean
  apparent_sensor?: string
  aqi_sensor?: string
}

export const enum WeatherEntityFeature {
  FORECAST_DAILY = 1,
  FORECAST_HOURLY = 2,
  FORECAST_TWICE_DAILY = 4,
}

export interface Weather extends HassEntity {
  state: string
  attributes: {
    temperature?: number
    temperature_unit: TemperatureUnit
    humidity?: number
    precipitation_unit: string
    forecast?: WeatherForecast[]
    supported_features: WeatherEntityFeature
  }
}

export type TemperatureUnit = '°C' | '°F'

export interface WeatherForecast {
  datetime: string
  condition: string
  temperature: number | null
  humidity?: number | null
  precipitation: number | null
  precipitation_probability: number | null
  templow: number | null
}

export interface MergedWeatherForecast {
  datetime: DateTime
  condition: string
  temperature: number
  precipitation: number
  precipitation_probability: number
  templow: number
}

export class Rgb {
  r: number
  g: number
  b: number

  constructor (r: number, g: number, b: number) {
    this.r = r
    this.g = g
    this.b = b
  }

  toRgbString (): string {
    return `rgb(${this.r}, ${this.g}, ${this.b})`
  }
}

export interface TemperatureSensor extends HassEntity {
  state: string
  attributes: {
    unit_of_measurement?: TemperatureUnit
  }
}

export interface HumiditySensor extends HassEntity {
  state: string
}

export interface WeatherForecastEvent {
  forecast?: WeatherForecast[]
  type: 'hourly' | 'daily' | 'twice_daily'
}
