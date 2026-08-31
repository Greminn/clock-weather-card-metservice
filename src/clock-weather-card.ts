import { LitElement, html, svg, type TemplateResult, type PropertyValues, type CSSResultGroup } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import {
  type HomeAssistant,
  hasConfigOrEntityChanged,
  hasAction,
  type ActionHandlerEvent,
  handleAction,
  TimeFormat,
  type ActionConfig
} from 'custom-card-helpers' // This is a community maintained npm module with common helper functions/types. https://github.com/custom-cards/custom-card-helpers

import {
  type ClockWeatherCardConfig,
  type MergedClockWeatherCardConfig,
  type MergedWeatherForecast,
  Rgb,
  type TemperatureSensor,
  type TemperatureUnit,
  type HumiditySensor,
  type Weather,
  WeatherEntityFeature,
  type WeatherForecast,
  type WeatherForecastEvent
} from './types'
import styles from './styles'
import { actionHandler } from './action-handler-directive'
import { localize } from './localize/localize'
import { type HassEntity, type HassEntityBase } from 'home-assistant-js-websocket'
import { extractMostOccuring, max, min, roundIfNotNull, roundUp } from './utils'
import { animatedIcons, staticIcons } from './images'
import { metserviceIconKey, tideIcon } from './metservice-icons'
import { version } from '../package.json'
import { safeRender } from './helpers'
import { DateTime } from 'luxon'

console.info(
  `%c  CLOCK-WEATHER-CARD-METSERVICE \n%c Version: ${version}`,
  'color: orange; font-weight: bold; background: black',
  'color: white; font-weight: bold; background: dimgray'
);

// This puts your card into the UI card picker dialog
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).customCards = (window as any).customCards || [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).customCards.push({
  type: 'clock-weather-card-metservice',
  name: 'Clock Weather Card (MetService)',
  description: 'MetService NZ variant of clock-weather-card: date/time plus current weather and an iOS-inspired forecast, with icons that match the MetService app.'
})

const gradientMap: Map<number, Rgb> = new Map()
  .set(-20, new Rgb(0, 60, 98)) // dark blue
  .set(-10, new Rgb(120, 162, 204)) // darker blue
  .set(0, new Rgb(164, 195, 210)) // light blue
  .set(10, new Rgb(121, 210, 179)) // turquoise
  .set(20, new Rgb(252, 245, 112)) // yellow
  .set(30, new Rgb(255, 150, 79)) // orange
  .set(40, new Rgb(255, 192, 159)) // red

@customElement('clock-weather-card-metservice')
export class ClockWeatherCard extends LitElement {
  // https://lit.dev/docs/components/properties/
  @property({ attribute: false }) public hass!: HomeAssistant

  @state() private config!: MergedClockWeatherCardConfig
  @state() private currentDate!: DateTime
  @state() private forecasts?: WeatherForecast[]
  @state() private error?: TemplateResult
  private forecastSubscriber?: () => Promise<void>
  private forecastSubscriberLock = false

  constructor () {
    super()
    this.currentDate = DateTime.now()
    const msToNextSecond = (1000 - this.currentDate.millisecond)
    setTimeout(() => setInterval(() => { this.currentDate = DateTime.now() }, 1000), msToNextSecond)
    setTimeout(() => { this.currentDate = DateTime.now() }, msToNextSecond)
  }

  public static getStubConfig (_hass: HomeAssistant, entities: string[], entitiesFallback: string[]): Record<string, unknown> {
    const entity = entities.find(e => e.startsWith('weather.') ?? entitiesFallback.find(() => true))
    if (entity) {
      return { entity }
    }

    return {}
  }

  public getCardSize (): number {
    return 3 + roundUp(this.config.forecast_rows / 2)
  }

  // https://lit.dev/docs/components/properties/#accessors-custom
  public setConfig (config?: ClockWeatherCardConfig): void {
    if (!config) {
      throw this.createError('Invalid configuration.')
    }

    if (!config.entity) {
      throw this.createError('Attribute "entity" must be present.')
    }

    if (config.forecast_rows && config.forecast_rows < 1) {
      throw this.createError('Attribute "forecast_rows" must be greater than 0.')
    }

    if (config.time_format && config.time_format.toString() !== '24' && config.time_format.toString() !== '12') {
      throw this.createError('Attribute "time_format" must either be "12" or "24".')
    }

    if (config.hide_today_section && config.hide_forecast_section) {
      throw this.createError('Attributes "hide_today_section" and "hide_forecast_section" must not enabled at the same time.')
    }

    this.config = this.mergeConfig(config)
  }

  // https://lit.dev/docs/components/lifecycle/#reactive-update-cycle-performing
  protected shouldUpdate (changedProps: PropertyValues): boolean {
    if (!this.config) {
      return false
    }

    if (changedProps.has('forecasts')) {
      return true
    }

    const oldHass = changedProps.get('hass') as HomeAssistant | undefined
    if (oldHass) {
      const oldSun = oldHass.states[this.config.sun_entity]
      const newSun = this.hass.states[this.config.sun_entity]
      if (oldSun !== newSun) {
        return true
      }
    }

    return hasConfigOrEntityChanged(this, changedProps, false)
  }

  protected updated (changedProps: PropertyValues): void {
    super.updated(changedProps)
    if (changedProps.has('config')) {
      void this.subscribeForecastEvents()
    }
  }

  // https://lit.dev/docs/components/rendering/
  protected render (): TemplateResult {
    if (this.error) {
      return this.error
    }

    const showToday = !this.config.hide_today_section
    const showForecast = !this.config.hide_forecast_section
    return html`
      <ha-card
        @action=${(e: ActionHandlerEvent) => { this.handleAction(e) }}
        .actionHandler=${actionHandler({
      hasHold: hasAction(this.config.hold_action as ActionConfig | undefined),
      hasDoubleClick: hasAction(this.config.double_tap_action as ActionConfig | undefined)
    })}
        tabindex="0"
        .label=${`Clock Weather Card: ${this.config.entity || 'No Entity Defined'}`}
      >
        ${this.config.title
        ? html`
          <div class="card-header">
            ${this.config.title}
          </div>`
        : ''}
        <div class="card-content">
          ${showToday
        ? html`
            <clock-weather-card-today>
              ${safeRender(() => this.renderToday())}
            </clock-weather-card-today>`
        : ''}
          ${showToday
        ? html`
            <clock-weather-card-condition>
              ${safeRender(() => this.renderConditionLine())}
            </clock-weather-card-condition>`
        : ''}
          ${this.config.description_entity
        ? html`
            <clock-weather-card-description>
              ${safeRender(() => this.renderDescription())}
            </clock-weather-card-description>`
        : ''}
          ${this.config.today_breakdown?.length
        ? html`
            <clock-weather-card-breakdown>
              ${safeRender(() => this.renderTodayBreakdown())}
            </clock-weather-card-breakdown>`
        : ''}
          ${showForecast
        ? html`
            <clock-weather-card-forecast>
              ${safeRender(() => this.renderForecast())}
            </clock-weather-card-forecast>`
        : ''}
          ${this.config.iframe_url
        ? html`
            <clock-weather-card-iframe>
              ${safeRender(() => this.renderIframe())}
            </clock-weather-card-iframe>`
        : ''}
          ${this.config.tide_entity
        ? html`
            <clock-weather-card-tide-graph>
              ${safeRender(() => this.renderTideGraph())}
            </clock-weather-card-tide-graph>`
        : this.config.tide_high_entity && this.config.tide_low_entity
        ? html`
            <clock-weather-card-tides>
              ${safeRender(() => this.renderTides())}
            </clock-weather-card-tides>`
        : ''}
        </div>
      </ha-card>
    `
  }

  public connectedCallback (): void {
    super.connectedCallback()
    if (this.hasUpdated) {
      void this.subscribeForecastEvents()
    }
  }

  public disconnectedCallback (): void {
    super.disconnectedCallback()
    void this.unsubscribeForecastEvents()
  }

  protected willUpdate (changedProps: PropertyValues): void {
    super.willUpdate(changedProps)
    if (!this.forecastSubscriber) {
      void this.subscribeForecastEvents()
    }
  }

  private renderToday (): TemplateResult {
    const weather = this.getWeather()
    const state = weather.state
    const temp = this.config.show_decimal ? this.getCurrentTemperature() : roundIfNotNull(this.getCurrentTemperature())
    const tempUnit = weather.attributes.temperature_unit
    const iconType = this.config.weather_icon_type
    const msIconKey = metserviceIconKey(this.metserviceCondition())
    const icon = this.toIcon(msIconKey ?? state, iconType, 'auto', this.getIconAnimationKind())
    const weatherString = this.localize(`weather.${state}`)
    const localizedTemp = temp !== null ? this.toConfiguredTempWithUnit(tempUnit, temp) : null

    return html`
      <clock-weather-card-today-left>
        <img class="grow-img" src=${icon} />
      </clock-weather-card-today-left>
      <clock-weather-card-today-right>
        <clock-weather-card-today-right-wrap>
          <clock-weather-card-today-right-wrap-top>
            ${this.config.hide_clock ? weatherString : ''}
          </clock-weather-card-today-right-wrap-top>
          <clock-weather-card-today-right-wrap-center>
            ${this.config.hide_clock ? localizedTemp ?? 'n/a' : this.time()}
          </clock-weather-card-today-right-wrap-center>
          <clock-weather-card-today-right-wrap-bottom>
            ${this.config.hide_date ? '' : this.date()}
          </clock-weather-card-today-right-wrap-bottom>
        </clock-weather-card-today-right-wrap>
      </clock-weather-card-today-right>`
  }

  // MetService fork: the current condition / temperature / feels-like line,
  // shown centred just above the forecast rather than in the today section.
  private renderConditionLine (): TemplateResult {
    const weather = this.getWeather()
    const tempUnit = weather.attributes.temperature_unit
    const temp = this.config.show_decimal ? this.getCurrentTemperature() : roundIfNotNull(this.getCurrentTemperature())
    const apparentTemp = this.config.show_decimal ? this.getApparentTemperature() : roundIfNotNull(this.getApparentTemperature())
    const humidity = roundIfNotNull(this.getCurrentHumidity())
    const aqi = this.getAqi()
    const weatherString = this.localize(`weather.${weather.state}`)
    const localizedTemp = temp !== null ? this.toConfiguredTempWithUnit(tempUnit, temp) : null

    const parts: string[] = [localizedTemp ? `${weatherString}, ${localizedTemp}` : weatherString]
    if (this.config.apparent_sensor && apparentTemp !== null) {
      parts.push(`${this.localize('misc.feels-like')}: ${this.toConfiguredTempWithUnit(tempUnit, apparentTemp)}`)
    }
    if (this.config.show_humidity && humidity !== null) {
      parts.push(`${humidity}% ${this.localize('misc.humidity')}`)
    }
    return html`
      <condition-text>${parts.join(' · ')}</condition-text>
      ${this.config.aqi_sensor && aqi !== null
        ? html`<aqi style="background-color: ${this.getAqiBackgroundColor(aqi)}; color: ${this.getAqiTextColor(aqi)};">${aqi} ${this.localize('misc.aqi')}</aqi>`
        : ''}
    `
  }

  private renderForecast (): TemplateResult[] {
    const weather = this.getWeather()
    const currentTemp = roundIfNotNull(this.getCurrentTemperature())
    const maxRowsCount = this.config.forecast_rows
    const hourly = this.config.hourly_forecast
    const temperatureUnit = weather.attributes.temperature_unit

    const forecasts = this.mergeForecasts(maxRowsCount, hourly)

    const minTemps = forecasts.map((f) => f.templow)
    const maxTemps = forecasts.map((f) => f.temperature)
    if (currentTemp !== null) {
      minTemps.push(currentTemp)
      maxTemps.push(currentTemp)
    }
    const minTemp = Math.round(min(minTemps))
    const maxTemp = Math.round(max(maxTemps))

    const displayTexts = forecasts
      .map(f => f.datetime)
      .map(d => hourly ? this.time(d) : this.localize(`day.${d.weekday}`))
    const maxColOneChars = displayTexts.length ? max(displayTexts.map(t => t.length)) : 0

    return forecasts.map((forecast, i) => safeRender(() => this.renderForecastItem(forecast, minTemp, maxTemp, currentTemp, temperatureUnit, hourly, displayTexts[i], maxColOneChars)))
  }

  private renderForecastItem (forecast: MergedWeatherForecast, minTemp: number, maxTemp: number, currentTemp: number | null, temperatureUnit: TemperatureUnit, hourly: boolean, displayText: string, maxColOneChars: number): TemplateResult {
    const msIconKey = metserviceIconKey(this.metserviceCondition(forecast.datetime))
    // MetService icons follow the today section's line/fill preference (the
    // MetService tokens carry a real sun that the plain 'fill' rows drop);
    // stock rows keep upstream's 'fill' + the pouring/rainy glyph remap.
    const weatherState = msIconKey ?? (forecast.condition === 'pouring' ? 'raindrops' : forecast.condition === 'rainy' ? 'raindrop' : forecast.condition)
    const iconType = msIconKey ? this.config.weather_icon_type : 'fill'
    const weatherIcon = this.toIcon(weatherState, iconType, 'day', 'static')
    const tempUnit = this.getWeather().attributes.temperature_unit
    const isNow = hourly ? DateTime.now().hour === forecast.datetime.hour : DateTime.now().day === forecast.datetime.day
    const minTempDay = Math.round(isNow && currentTemp !== null ? Math.min(currentTemp, forecast.templow) : forecast.templow)
    const maxTempDay = Math.round(isNow && currentTemp !== null ? Math.max(currentTemp, forecast.temperature) : forecast.temperature)

    return html`
      <clock-weather-card-forecast-row style="--col-one-size: ${(maxColOneChars * 0.5)}rem;">
        ${this.renderText(displayText)}
        ${this.renderIcon(weatherIcon)}
        ${this.renderText(this.toConfiguredTempWithUnit(tempUnit, minTempDay), 'right')}
        ${this.renderForecastTemperatureBar(minTemp, maxTemp, minTempDay, maxTempDay, isNow, currentTemp, temperatureUnit)}
        ${this.renderText(this.toConfiguredTempWithUnit(tempUnit, maxTempDay))}
      </clock-weather-card-forecast-row>
    `
  }

  // MetService fork: plain-English forecast summary line.
  private renderDescription (): TemplateResult {
    const entity = this.config.description_entity ? this.hass.states[this.config.description_entity] : undefined
    if (!entity) return html``
    const text = (entity.attributes?.full_description as string | undefined) ?? entity.state
    if (!text || text === 'unknown' || text === 'unavailable') return html``
    return html`<description-text>${text}</description-text>`
  }

  // MetService fork: compact "today, part by part" row. Each configured entity
  // (sensor.<location>_condition_<part>) has a raw MetService token as its state.
  private renderTodayBreakdown (): TemplateResult {
    const entities = this.config.today_breakdown ?? []
    const kind = this.getIconAnimationKind()
    return html`
      ${entities.map((entityId) => {
        const entity = this.hass.states[entityId]
        if (!entity) return html``
        const rawName = (entity.attributes?.friendly_name as string | undefined) ?? entityId
        const label = rawName.split(/[\s_]+/).pop() ?? rawName
        const isNight = /night|overnight/i.test(label)
        const iconKey = metserviceIconKey(entity.state) ?? 'cloudy'
        const icon = this.toIcon(iconKey, this.config.weather_icon_type, isNight ? 'night' : 'day', kind)
        return html`
          <breakdown-cell>
            <img class="grow-img" src=${icon} />
            <breakdown-label>${label.charAt(0).toUpperCase() + label.slice(1)}</breakdown-label>
          </breakdown-cell>`
      })}
    `
  }

  // MetService fork: an embedded page (e.g. a Windy map served from /local/).
  private renderIframe (): TemplateResult {
    const url = this.config.iframe_url
    if (!url) return html``
    const h = this.config.iframe_height
    const height = h === undefined ? '200px' : typeof h === 'number' ? `${h}px` : h
    return html`<iframe src=${url} style="height: ${height};" loading="lazy" referrerpolicy="no-referrer"></iframe>`
  }

  // MetService fork: a tide curve for the next ~24 h from the `tide_table`
  // attribute (list of { type: HIGH|LOW, time: ISO, height: metres }) — shows
  // where the tide is right now plus the upcoming lows and highs. The curve
  // between two consecutive extremes is the standard half-cosine tide
  // approximation.
  private tideHeightAt (a: { t: DateTime, h: number }, b: { t: DateTime, h: number }, ms: number): number {
    const f = (ms - a.t.toMillis()) / (b.t.toMillis() - a.t.toMillis())
    return (a.h + b.h) / 2 + ((a.h - b.h) / 2) * Math.cos(Math.PI * Math.min(1, Math.max(0, f)))
  }

  private renderTideGraph (): TemplateResult {
    const entity = this.config.tide_entity ? this.hass.states[this.config.tide_entity] : undefined
    const table = entity?.attributes?.tide_table as Array<{ type?: string, time?: string, height?: string | number }> | undefined
    if (!Array.isArray(table) || table.length < 2) return html``

    const all = table
      .map((e) => ({ t: DateTime.fromISO(String(e.time)), h: parseFloat(String(e.height)), high: String(e.type).toUpperCase() === 'HIGH' }))
      .filter((p) => p.t.isValid && !isNaN(p.h))
      .sort((a, b) => a.t.toMillis() - b.t.toMillis())

    const now = DateTime.now()
    const winStart = now.minus({ hours: 2 }).toMillis()
    const winEnd = now.plus({ hours: 24 }).toMillis()
    // bracket the window with one extreme either side so the curve is continuous
    const firstAfterStart = all.findIndex((p) => p.t.toMillis() > winStart)
    const startIdx = firstAfterStart <= 0 ? 0 : firstAfterStart - 1
    let endIdx = all.findIndex((p) => p.t.toMillis() >= winEnd)
    if (endIdx === -1) endIdx = all.length - 1
    const seg = all.slice(startIdx, endIdx + 1)
    if (seg.length < 2) return html``

    const W = 320
    const H = 72
    const pad = { l: 4, r: 4, t: 18, b: 15 }
    const heights = seg.map((p) => p.h)
    let hMin = Math.min(...heights)
    let hMax = Math.max(...heights)
    const range = hMax - hMin || 1
    hMin -= range * 0.22
    hMax += range * 0.28

    const x = (ms: number): number => pad.l + ((ms - winStart) / (winEnd - winStart)) * (W - pad.l - pad.r)
    const y = (h: number): number => pad.t + ((hMax - h) / (hMax - hMin)) * (H - pad.t - pad.b)

    const curve: Array<[number, number]> = []
    for (let i = 0; i < seg.length - 1; i++) {
      const a = seg[i]
      const b = seg[i + 1]
      for (let s = i === 0 ? 0 : 1; s <= 24; s++) {
        const f = s / 24
        const ms = a.t.toMillis() + f * (b.t.toMillis() - a.t.toMillis())
        curve.push([x(ms), y(this.tideHeightAt(a, b, ms))])
      }
    }
    const linePath = 'M ' + curve.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' L ')
    const areaPath = `${linePath} L ${curve[curve.length - 1][0].toFixed(1)},${(H - pad.b).toFixed(1)} L ${curve[0][0].toFixed(1)},${(H - pad.b).toFixed(1)} Z`

    // current tide height
    const nowMs = now.toMillis()
    let hNow: number | undefined
    for (let i = 0; i < seg.length - 1; i++) {
      if (nowMs >= seg[i].t.toMillis() && nowMs <= seg[i + 1].t.toMillis()) { hNow = this.tideHeightAt(seg[i], seg[i + 1], nowMs); break }
    }

    const visible = seg.filter((p) => p.t.toMillis() >= winStart && p.t.toMillis() <= winEnd)
    const nextLow = visible.find((p) => !p.high && p.t.toMillis() >= nowMs)
    const nextHigh = visible.find((p) => p.high && p.t.toMillis() >= nowMs)

    // contextual summary line — direction + the next matching tide + time to it
    const direction = String(entity?.state ?? '').toLowerCase()
    const nextExtreme = direction === 'rising'
      ? nextHigh
      : direction === 'falling'
        ? nextLow
        : (nextLow && nextHigh ? (nextLow.t < nextHigh.t ? nextLow : nextHigh) : (nextLow ?? nextHigh))
    let summary = ''
    if (nextExtreme) {
      const mins = Math.max(0, Math.round((nextExtreme.t.toMillis() - nowMs) / 60000))
      const when = mins < 60
        ? `${mins} minute${mins === 1 ? '' : 's'}`
        : `${Math.round(mins / 60)} hour${Math.round(mins / 60) === 1 ? '' : 's'}`
      const dirWord = direction === 'rising' || direction === 'falling'
        ? direction
        : (nextExtreme.high ? 'rising' : 'falling')
      summary = `Tides are ${dirWord}, next ${nextExtreme.high ? 'high' : 'low'} tide in ${when}`
    }

    // midnight boundary within the window
    const midnight = now.plus({ days: 1 }).startOf('day')
    const midnightVisible = midnight.toMillis() > winStart && midnight.toMillis() < winEnd
    const mz = this.toZonedDate(midnight)

    return html`
      ${summary ? html`<tide-summary>${summary}</tide-summary>` : ''}
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" width="100%">
        <clipPath id="mscw-tide-clip"><rect x="0" y="0" width=${W} height=${H - pad.b + 0.5} /></clipPath>
        ${midnightVisible
          ? svg`<line class="tide-grid" x1=${x(midnight.toMillis()).toFixed(1)} y1=${pad.t} x2=${x(midnight.toMillis()).toFixed(1)} y2=${H - pad.b} />
                <text class="tide-day" x=${(x(midnight.toMillis()) + 2).toFixed(1)} y="10" text-anchor="start">${`${this.localize(`day.${mz.weekday}`)} ${mz.toFormat('d LLL')}`.toUpperCase()}</text>`
          : ''}
        <g clip-path="url(#mscw-tide-clip)">
          <path class="tide-area" d=${areaPath} />
          <path class="tide-line" d=${linePath} />
        </g>
        <line class="tide-now" x1=${x(nowMs).toFixed(1)} y1=${pad.t - 6} x2=${x(nowMs).toFixed(1)} y2=${H - pad.b} />
        ${hNow !== undefined
          ? svg`<circle class="tide-now-dot" cx=${x(nowMs).toFixed(1)} cy=${y(hNow).toFixed(1)} r="2.8" />
                <text class="tide-now-label" x=${x(nowMs).toFixed(1)} y=${pad.t - 8} text-anchor="middle">Now ${hNow.toFixed(1)}m</text>`
          : ''}
        ${visible.map((p) => {
          const isNext = p === nextLow || p === nextHigh
          return svg`
            <circle class="${isNext ? 'tide-dot tide-dot-next' : 'tide-dot'}" cx=${x(p.t.toMillis()).toFixed(1)} cy=${y(p.h).toFixed(1)} r=${isNext ? 2.6 : 2} />
            <text class="tide-tick" x=${x(p.t.toMillis()).toFixed(1)} y=${H - 4} text-anchor="middle">${p.high ? 'H' : 'L'} ${this.time(p.t)}</text>`
        })}
      </svg>
    `
  }

  // MetService fork: next high / next low tide, next event first.
  private renderTides (): TemplateResult {
    const kind = this.getIconAnimationKind()
    const type = this.config.weather_icon_type
    const cells: Array<{ when: DateTime, kind: 'high' | 'low' }> = []
    for (const [k, entityId] of [['high', this.config.tide_high_entity], ['low', this.config.tide_low_entity]] as const) {
      const raw = entityId ? this.hass.states[entityId]?.state : undefined
      const when = raw ? DateTime.fromISO(raw) : undefined
      if (when?.isValid) cells.push({ when, kind: k })
    }
    cells.sort((a, b) => a.when.toMillis() - b.when.toMillis())
    return html`
      ${cells.map(({ when, kind: tideKind }) => {
        const zoned = this.toZonedDate(when)
        const sameDay = zoned.hasSame(this.toZonedDate(this.currentDate), 'day')
        const label = tideKind === 'high' ? 'Next High Tide' : 'Next Low Tide'
        const timeText = sameDay ? this.time(when) : `${this.localize(`day.${zoned.weekday}`)} ${this.time(when)}`
        return html`
          <tide-cell>
            <img class="grow-img" src=${tideIcon(tideKind, type, kind)} />
            <tide-text>
              <tide-label>${label}</tide-label>
              <tide-time>${timeText}</tide-time>
            </tide-text>
          </tide-cell>`
      })}
    `
  }

  private renderText (text: string, textAlign: 'left' | 'center' | 'right' = 'left'): TemplateResult {
    return html`
      <forecast-text style="--text-align: ${textAlign};">
        ${text}
      </forecast-text>
    `
  }

  private renderIcon (src: string): TemplateResult {
    return html`
      <forecast-icon>
        <img class="grow-img" src=${src} />
      </forecast-icon>
    `
  }

  private renderForecastTemperatureBar (minTemp: number, maxTemp: number, minTempDay: number, maxTempDay: number, isNow: boolean, currentTemp: number | null, temperatureUnit: TemperatureUnit): TemplateResult {
    const { startPercent, endPercent } = this.calculateBarRangePercents(minTemp, maxTemp, minTempDay, maxTempDay)
    const moveRight = maxTemp === minTemp ? 0 : (minTempDay - minTemp) / (maxTemp - minTemp)
    return html`
      <forecast-temperature-bar>
        <forecast-temperature-bar-background> </forecast-temperature-bar-background>
        <forecast-temperature-bar-range
          style="--move-right: ${moveRight.toFixed(2)}; --start-percent: ${startPercent.toFixed(2)}%; --end-percent: ${endPercent.toFixed(2)}%; --gradient: ${this.createGradientString(
            minTempDay,
            maxTempDay,
            temperatureUnit
          )};"
        >
          ${isNow ? this.renderForecastCurrentTemp(minTempDay, maxTempDay, currentTemp) : ''}
        </forecast-temperature-bar-range>
      </forecast-temperature-bar>
    `
  }

  private renderForecastCurrentTemp (minTempDay: number, maxTempDay: number, currentTemp: number | null): TemplateResult {
    if (currentTemp == null) {
      return html``
    }
    const indicatorPosition = minTempDay === maxTempDay ? 0 : (100 / (maxTempDay - minTempDay)) * (currentTemp - minTempDay)
    const steps = maxTempDay - minTempDay
    const moveRight = maxTempDay === minTempDay ? 0 : (currentTemp - minTempDay) / steps
    return html`
      <forecast-temperature-bar-current-indicator style="--position: ${indicatorPosition}%;">
        <forecast-temperature-bar-current-indicator-dot style="--move-right: ${moveRight}">
        </forecast-temperature-bar-current-indicator-dot>
      </forecast-temperature-bar-current-indicator>
    `
  }

  // https://lit.dev/docs/components/styles/
  static get styles (): CSSResultGroup {
    return styles
  }

  private createGradientString (minTempDay: number, maxTempDay: number, temperatureUnit: TemperatureUnit): string {
    function linearizeColor (temp: number, [tempLeft, colorLeft]: [number, Rgb], [tempRight, colorRight]: [number, Rgb]): Rgb {
      const ratio = Math.max(Math.min((temp - tempLeft) / (tempRight - tempLeft), 1.0), 0.0)
      return new Rgb(
        Math.round(colorLeft.r + ratio * (colorRight.r - colorLeft.r)),
        Math.round(colorLeft.g + ratio * (colorRight.g - colorLeft.g)),
        Math.round(colorLeft.b + ratio * (colorRight.b - colorLeft.b))
      )
    }

    const minTempDayCelsius = this.toCelsius(temperatureUnit, minTempDay)
    const maxTempDayCelsius = this.toCelsius(temperatureUnit, maxTempDay)

    if (minTempDayCelsius === maxTempDayCelsius) {
      const entries = [...gradientMap.entries()]
      let color: Rgb
      if (minTempDayCelsius <= entries[0][0]) {
        color = entries[0][1]
      } else if (minTempDayCelsius >= entries[entries.length - 1][0]) {
        color = entries[entries.length - 1][1]
      } else {
        const upperIndex = entries.findIndex(([temp]) => temp >= minTempDayCelsius)
        color = linearizeColor(minTempDayCelsius, entries[upperIndex - 1], entries[upperIndex])
      }
      return `${color.toRgbString()} 0%, ${color.toRgbString()} 100%`
    }

    const outputGradient = ([...gradientMap.entries()]
      .reduce((gradient, [temp, color], index, arr) => {
        if (index === 0) {
          // First color
          // Remark: This if-level can't be optimized away as in the unlikely event
          // that the daily low would be exactly same floating point value than
          // the first color temperature, we would hit negative index on the lower branches.
          if (temp > minTempDayCelsius) {
            // Daily low is lower than lowest color temperature
            // so we have to duplicate.
            gradient.set(0.0, color)
            gradient.set((temp - minTempDayCelsius) / (maxTempDayCelsius - minTempDayCelsius), color)
          } else {
            // Temp is smaller or equal than daily low so we'll skip the color until we know what we need to linearize.
          }
        } else if (temp < minTempDayCelsius) {
          // Still haven't found a color that would be the first one

        } else if (!gradient.has(0.0)) {
          // This is the first color usable color, we need to linearize the color with the previous one
          gradient.set(0.0, linearizeColor(minTempDayCelsius, arr[index - 1], [temp, color]))

          // and then add this color to the right position
          if (temp > maxTempDayCelsius) {
            // This color is also higher than the daily max so we need to linearize it as well
            gradient.set(1.0, linearizeColor(maxTempDayCelsius, arr[index - 1], [temp, color]))
          } else {
            // In other cases (> 0.0 and <= 1.0) we calculate the position
            gradient.set((temp - minTempDayCelsius) / (maxTempDayCelsius - minTempDayCelsius), color)
          }
        } else if (temp < maxTempDayCelsius) {
          // color is on the gradient
          gradient.set((temp - minTempDayCelsius) / (maxTempDayCelsius - minTempDayCelsius), color)
        } else if (!gradient.has(1.0)) {
          // Last color of the gradient
          if (temp > maxTempDayCelsius) {
            // Linearize the last color
            gradient.set(1.0, linearizeColor(maxTempDayCelsius, arr[index - 1], [temp, color]))
          } else {
            // Get last color from the color temperature
            gradient.set(1.0, color)
          }
        } else {
          // We don't care for intermediate colors that are not on the daily gradient
        }

        return gradient
      }, new Map<number, Rgb>())
    )

    // Gradient endpoint check
    if (!outputGradient.has(1.0)) {
      // Gradient is missing the final color. This means that the daily max is higher
      // than highest color temperature so we have to duplicate.
      outputGradient.set(1.0, Array.from(outputGradient.values()).slice(-1)[0])
    }

    // Make the gradient string
    return ([...outputGradient.entries()]
      .map(([pos, color]) => `${color.toRgbString()} ${Math.round(pos * 100.0)}%`)
      .join(', ')
    )
  }

  private handleAction (ev: ActionHandlerEvent): void {
    if (this.hass && this.config && ev.detail.action) {
      handleAction(this, this.hass, this.config, ev.detail.action)
    }
  }

  private mergeConfig (config: ClockWeatherCardConfig): MergedClockWeatherCardConfig {
    return {
      ...config,
      sun_entity: config.sun_entity ?? 'sun.sun',
      temperature_sensor: config.temperature_sensor,
      humidity_sensor: config.humidity_sensor,
      weather_icon_type: config.weather_icon_type ?? 'line',
      forecast_rows: config.forecast_rows ?? 5,
      hourly_forecast: config.hourly_forecast ?? false,
      animated_icon: config.animated_icon ?? true,
      time_format: config.time_format?.toString() as '12' | '24' | undefined,
      time_pattern: config.time_pattern ?? undefined,
      show_humidity: config.show_humidity ?? false,
      hide_forecast_section: config.hide_forecast_section ?? false,
      hide_today_section: config.hide_today_section ?? false,
      hide_clock: config.hide_clock ?? false,
      hide_date: config.hide_date ?? false,
      date_pattern: config.date_pattern ?? 'D',
      maori_day_names: config.maori_day_names ?? false,
      condition_entity: config.condition_entity ?? undefined,
      description_entity: config.description_entity ?? undefined,
      today_breakdown: config.today_breakdown ?? undefined,
      tide_entity: config.tide_entity ?? undefined,
      tide_high_entity: config.tide_high_entity ?? undefined,
      tide_low_entity: config.tide_low_entity ?? undefined,
      iframe_url: config.iframe_url ?? undefined,
      iframe_height: config.iframe_height ?? undefined,
      use_browser_time: config.use_browser_time ?? false,
      time_zone: config.time_zone ?? undefined,
      show_decimal: config.show_decimal ?? false,
      apparent_sensor: config.apparent_sensor ?? undefined,
      aqi_sensor: config.aqi_sensor ?? undefined
    }
  }

  private toIcon (weatherState: string, type: 'fill' | 'line', daytime: 'day' | 'night' | 'auto', kind: 'static' | 'animated'): string {
    const resolved = daytime !== 'auto' ? daytime : this.getSun()?.state === 'below_horizon' ? 'night' : 'day'
    const iconMap = kind === 'animated' ? animatedIcons : staticIcons
    const icon = iconMap[type][weatherState]
    return icon?.[resolved] || icon
  }

  // MetService fork: raw MetService condition token for a given day, or for the
  // current conditions (the `condition_entity` state) when no date is given.
  //
  // Per-day tokens come from that entity's `daily_conditions` attribute — the
  // list `sensor.<location>_condition_today` exposes in metservice-weather
  // >= 2026.9.0 ([{ date, condition }], keyed by date). `forecast` is also
  // accepted for a hand-rolled template sensor. Match on `date`, never list
  // position (entry 0 can lag the wall clock by a poll just after midnight).
  //
  // Returns undefined when the option is unset, the entity is missing, or no
  // entry matches — the caller then falls back to the stock icon.
  private metserviceCondition (date?: DateTime): string | undefined {
    const entityId = this.config.condition_entity
    if (!entityId) return undefined
    const entity = this.hass.states[entityId]
    if (!entity) return undefined
    if (!date) return typeof entity.state === 'string' ? entity.state : undefined
    const list = (entity.attributes?.daily_conditions ?? entity.attributes?.forecast) as
      Array<{ date?: string, datetime?: string, condition?: string }> | undefined
    if (!Array.isArray(list)) return undefined
    const iso = date.toISODate()
    const match = list.find((e) => {
      const d = e.date ?? e.datetime
      return typeof d === 'string' && d.slice(0, 10) === iso
    })
    return match?.condition
  }

  private getWeather (): Weather {
    const weather = this.hass.states[this.config.entity] as unknown as Weather | undefined
    if (!weather) {
      throw this.createError(`Weather entity "${this.config.entity}" could not be found.`)
    }
    return weather
  }

  private getCurrentTemperature (): number | null {
    if (this.config.temperature_sensor) {
      const temperatureSensor = this.hass.states[this.config.temperature_sensor] as TemperatureSensor | undefined
      const temp = temperatureSensor?.state ? parseFloat(temperatureSensor.state) : undefined
      const unit = temperatureSensor?.attributes.unit_of_measurement ?? this.getConfiguredTemperatureUnit()
      if (temp !== undefined && !isNaN(temp)) {
        return this.toConfiguredTempWithoutUnit(unit, temp)
      }
    }

    // return weather temperature if above code could not extract temperature from temperature_sensor
    return this.getWeather().attributes.temperature ?? null
  }

  private getCurrentHumidity (): number | null {
    if (this.config.humidity_sensor) {
      const humiditySensor = this.hass.states[this.config.humidity_sensor] as HumiditySensor | undefined
      const humid = humiditySensor?.state ? parseFloat(humiditySensor.state) : undefined
      if (humid !== undefined && !isNaN(humid)) {
        return humid
      }
    }

    // Return weather humidity if the code could not extract humidity from the humidity_sensor
    return this.getWeather().attributes.humidity ?? null
  }

  private getApparentTemperature (): number | null {
    if (this.config.apparent_sensor) {
      const apparentSensor = this.hass.states[this.config.apparent_sensor] as TemperatureSensor | undefined
      const temp = apparentSensor?.state ? parseFloat(apparentSensor.state) : undefined
      const unit = apparentSensor?.attributes.unit_of_measurement ?? this.getConfiguredTemperatureUnit()
      if (temp !== undefined && !isNaN(temp)) {
        return this.toConfiguredTempWithoutUnit(unit, temp)
      }
    }
    return null
  }

  private getAqi (): number | null {
    if (this.config.aqi_sensor) {
      const aqiSensor = this.hass.states[this.config.aqi_sensor] as HassEntity | undefined
      const aqi = aqiSensor?.state ? parseInt(aqiSensor.state) : undefined
      if (aqi !== undefined && !isNaN(aqi)) {
        return aqi
      }
    }
    return null
  }

  private getAqiBackgroundColor (aqi: number | null): string | null {
    if (aqi == null) {
      return null
    }
    if (aqi <= 50) return '#00FF00'
    if (aqi <= 100) return '#FFFF00'
    if (aqi <= 150) return '#FF8C00'
    if (aqi <= 200) return '#FF0000'
    if (aqi <= 300) return '#9400D3'
    return '#8B0000'
  }

  private getAqiTextColor (aqi: number | null): string {
    // Use black text for light backgrounds (green, yellow, orange) for better readability.
    if (aqi !== null && aqi <= 150) {
      return '#000000'
    }
    // Use white text for dark backgrounds (red, purple, maroon).
    return '#FFFFFF'
  }

  private getSun (): HassEntityBase | undefined {
    return this.hass.states[this.config.sun_entity]
  }

  private getLocale (): string {
    return this.config.locale ?? this.hass.locale.language ?? 'en-GB'
  }

  private date (): string {
    const zoned = this.toZonedDate(this.currentDate)
    const formatted = zoned.toFormat(this.config.date_pattern)
    if (!this.config.maori_day_names) return formatted
    // e.g. "Monday, 31 August 2026" -> "Monday/Rāhina, 31 August 2026"
    const maori = ['Rāhina', 'Rātū', 'Rāapa', 'Rāpare', 'Rāmere', 'Rāhoroi', 'Rātapu'][zoned.weekday - 1]
    const englishDay = zoned.toFormat('cccc')
    return maori && formatted.includes(englishDay)
      ? formatted.replace(englishDay, `${englishDay}/${maori}`)
      : formatted
  }

  private time (date: DateTime = this.currentDate): string {
    if (this.config.time_pattern) {
      return this.toZonedDate(date).toFormat(this.config.time_pattern)
    }

    if (this.config.time_format) {
      return this.toZonedDate(date)
        .toFormat(this.config.time_format === '24' ? 'HH:mm' : 'h:mm a')
    }
    if (this.hass.locale.time_format === TimeFormat.am_pm) {
      return this.toZonedDate(date).toFormat('h:mm a')
    }

    if (this.hass.locale.time_format === TimeFormat.twenty_four) {
      return this.toZonedDate(date).toFormat('HH:mm')
    }

    return this.toZonedDate(date).toFormat('t')
  }

  private getIconAnimationKind (): 'static' | 'animated' {
    return this.config.animated_icon ? 'animated' : 'static'
  }

  private toCelsius (temperatueUnit: TemperatureUnit, temperature: number): number {
    return temperatueUnit === '°C' ? temperature : Math.round((temperature - 32) * (5 / 9))
  }

  private toFahrenheit (temperatueUnit: TemperatureUnit, temperature: number): number {
    return temperatueUnit === '°F' ? temperature : Math.round((temperature * 9 / 5) + 32)
  }

  private getConfiguredTemperatureUnit (): TemperatureUnit {
    return this.hass.config.unit_system.temperature as TemperatureUnit
  }

  private toConfiguredTempWithUnit (unit: TemperatureUnit, temp: number): string {
    const convertedTemp = this.toConfiguredTempWithoutUnit(unit, temp)
    return convertedTemp + this.getConfiguredTemperatureUnit()
  }

  private toConfiguredTempWithoutUnit (unit: TemperatureUnit, temp: number): number {
    const configuredUnit = this.getConfiguredTemperatureUnit()
    if (configuredUnit === unit) {
      return temp
    }

    return unit === '°C'
      ? this.toFahrenheit(unit, temp)
      : this.toCelsius(unit, temp)
  }

  private calculateBarRangePercents (minTemp: number, maxTemp: number, minTempDay: number, maxTempDay: number): { startPercent: number, endPercent: number } {
    if (maxTemp === minTemp) {
      // avoid division by 0
      return { startPercent: 0, endPercent: 100 }
    }
    const startPercent = (100 / (maxTemp - minTemp)) * (minTempDay - minTemp)
    const endPercent = (100 / (maxTemp - minTemp)) * (maxTempDay - minTemp)
    // fix floating point issue
    // (100 / (19 - 8)) * (19 - 8) = 100.00000000000001
    return {
      startPercent: Math.max(0, startPercent),
      endPercent: Math.min(100, endPercent)
    }
  }

  private localize (key: string): string {
    return localize(key, this.getLocale())
  }

  private mergeForecasts (maxRowsCount: number, hourly: boolean): MergedWeatherForecast[] {
    const forecasts = this.isLegacyWeather() ? this.getWeather().attributes.forecast ?? [] : this.forecasts ?? []
    const agg = forecasts.reduce<Record<number, WeatherForecast[]>>((forecasts, forecast) => {
      const d = new Date(forecast.datetime)
      const unit = hourly ? `${d.getMonth()}-${d.getDate()}-${+d.getHours()}` : d.getDate()
      forecasts[unit] = forecasts[unit] || []
      forecasts[unit].push(forecast)
      return forecasts
    }, {})

    return Object.values(agg)
      .reduce((agg: MergedWeatherForecast[], forecasts) => {
        if (forecasts.length === 0) return agg
        const avg = this.calculateAverageForecast(forecasts)
        agg.push(avg)
        return agg
      }, [])
      .sort((a, b) => a.datetime.toMillis() - b.datetime.toMillis())
      .slice(0, maxRowsCount)
  }

  private toZonedDate (date: DateTime): DateTime {
    const localizedDate = date.setLocale(this.getLocale())
    if (this.config.use_browser_time) return localizedDate
    const timeZone = this.config.time_zone ?? this.hass?.config?.time_zone
    const withTimeZone = localizedDate.setZone(timeZone)
    if (withTimeZone.isValid) {
      return withTimeZone
    }
    console.error(`clock-weather-card - Time Zone [${timeZone}] not supported. Falling back to browser time.`)
    return localizedDate
  }

  private calculateAverageForecast (forecasts: WeatherForecast[]): MergedWeatherForecast {
    const minTemps = forecasts.map((f) => f.templow ?? f.temperature ?? this.getCurrentTemperature() ?? 0)
    const minTemp = min(minTemps)

    const maxTemps = forecasts.map((f) => f.temperature ?? this.getCurrentTemperature() ?? 0)
    const maxTemp = max(maxTemps)

    const precipitationProbabilities = forecasts.map((f) => f.precipitation_probability ?? 0)
    const precipitationProbability = max(precipitationProbabilities)

    const precipitations = forecasts.map((f) => f.precipitation ?? 0)
    const precipitation = max(precipitations)

    const conditions = forecasts.map((f) => f.condition)
    const condition = extractMostOccuring(conditions)

    return {
      temperature: maxTemp,
      templow: minTemp,
      datetime: this.parseDateTime(forecasts[0].datetime),
      condition,
      precipitation_probability: precipitationProbability,
      precipitation
    }
  }

  private async subscribeForecastEvents (): Promise<void> {
    if (this.forecastSubscriberLock) {
      return
    }
    this.forecastSubscriberLock = true
    await this.unsubscribeForecastEvents()
    if (this.isLegacyWeather()) {
      this.forecastSubscriber = async () => {}
      this.forecastSubscriberLock = false
      return
    }

    if (!this.isConnected || !this.config || !this.hass) {
      this.forecastSubscriberLock = false
      return
    }

    const forecastType = this.determineForecastType()
    if (forecastType === 'hourly_not_supported') {
      this.forecastSubscriber = async () => {}
      this.forecastSubscriberLock = false
      throw this.createError(`Weather entity [${this.config.entity}] does not support hourly forecast.`)
    }
    try {
      const callback = (event: WeatherForecastEvent): void => {
        this.forecasts = event.forecast
      }
      const options = { resubscribe: false }
      const message = {
        type: 'weather/subscribe_forecast',
        forecast_type: forecastType,
        entity_id: this.config.entity
      }
      this.forecastSubscriber = await this.hass.connection.subscribeMessage<WeatherForecastEvent>(callback, message, options)
    } catch (e: unknown) {
      console.error('clock-weather-card - Error when subscribing to weather forecast', e)
    } finally {
      this.forecastSubscriberLock = false
    }
  }

  private async unsubscribeForecastEvents (): Promise<void> {
    if (this.forecastSubscriber) {
      try {
        await this.forecastSubscriber()
      } catch (e: unknown) {
        // swallow error, as this means that connection was closed already
      } finally {
        this.forecastSubscriber = undefined
      }
    }
  }

  private isLegacyWeather (): boolean {
    return !this.supportsFeature(WeatherEntityFeature.FORECAST_DAILY) && !this.supportsFeature(WeatherEntityFeature.FORECAST_HOURLY)
  }

  private supportsFeature (feature: WeatherEntityFeature): boolean {
    try {
      return (this.getWeather().attributes.supported_features & feature) !== 0
    } catch (e) {
      // might be that weather entity was not found
      return false
    }
  }

  private createError (errorString: string): Error {
    const error = new Error(errorString)
    const errorCard = document.createElement('hui-error-card')
    errorCard.setConfig({
      type: 'error',
      error,
      origConfig: this.config
    })
    this.error = html`${errorCard}`
    return error
  }

  private determineForecastType (): 'hourly' | 'daily' | 'hourly_not_supported' {
    const supportsDaily = this.supportsFeature(WeatherEntityFeature.FORECAST_DAILY)
    const supportsHourly = this.supportsFeature(WeatherEntityFeature.FORECAST_HOURLY)
    const hourly = this.config.hourly_forecast
    if (supportsDaily && supportsHourly) {
      return hourly ? 'hourly' : 'daily'
    } else if (hourly && supportsHourly) {
      return 'hourly'
    } else if (!hourly && supportsDaily) {
      return 'daily'
    } else if (hourly && !supportsHourly) {
      return 'hourly_not_supported'
    } else {
      // !hourly && !supportsDaily
      console.warn(`clock-weather-card - Weather entity [${this.config.entity}] does not support daily forecast. Falling back to hourly forecast.`)
      return 'hourly'
    }
  }

  private parseDateTime (date: string): DateTime {
    const fromIso = DateTime.fromISO(date)
    if (fromIso.isValid) {
      return fromIso
    }
    return DateTime.fromJSDate(new Date(date))
  }
}
