// MetService (New Zealand) condition icons.
//
// The `metservice-weather` integration receives ~15 distinct condition tokens
// from MetService and collapses them into Home Assistant's fixed 15-value
// `weather` condition set before anything downstream can see them — so e.g.
// `few-showers` (the sun-behind-cloud-with-rain icon) and `showers` both arrive
// here as `rainy`, and the stock card can only draw one icon for both.
//
// When the card is given a `condition_entity` (see types.ts) we read MetService's
// raw token instead and map it here to one of the icon keys that images.ts
// already provides assets for. No new icon assets are needed: the Meteocons set
// bundled with the card already contains a sun-shower icon (`partly-cloudy-day-rain`,
// which images.ts wires to the `rainy` key).
//
// A trailing `-night` on a token is tolerated (MetService's forecast/breakdown
// feeds use base tokens, but the current-conditions feed can emit `-night`
// variants). An unknown token returns `undefined` so the caller falls back to
// the stock Home-Assistant-condition behaviour.

const METSERVICE_TO_ICON_KEY: Record<string, string> = {
  fine: 'sunny',
  'partly-cloudy': 'partlycloudy',
  'mostly-cloudy': 'cloudy',
  cloudy: 'cloudy',
  'few-showers': 'rainy', // -> partly-cloudy-day-rain (sun shower)
  showers: 'pouring',
  drizzle: 'rainy',
  rain: 'pouring',
  'wind-rain': 'pouring',
  'rain-wind': 'pouring',
  thunder: 'lightning',
  hail: 'hail',
  snow: 'snowy',
  windy: 'windy',
  fog: 'fog',
  frost: 'clear-night'
}

export function metserviceIconKey (token: string | undefined | null): string | undefined {
  if (!token || typeof token !== 'string') return undefined
  const t = token.trim().toLowerCase()
  if (t in METSERVICE_TO_ICON_KEY) return METSERVICE_TO_ICON_KEY[t]
  const base = t.endsWith('-night') ? t.slice(0, -'-night'.length) : t
  return base in METSERVICE_TO_ICON_KEY ? METSERVICE_TO_ICON_KEY[base] : undefined
}

// Tide icons for the optional tide row (metservice-weather's marine sensors).
// These aren't in images.ts's condition maps, so they get their own resolver.
import tideHighFillAnimated from './icons/fill/svg/tide-high.svg'
import tideHighFillStatic from './icons/fill/svg-static/tide-high.svg'
import tideHighLineAnimated from './icons/line/svg/tide-high.svg'
import tideHighLineStatic from './icons/line/svg-static/tide-high.svg'
import tideLowFillAnimated from './icons/fill/svg/tide-low.svg'
import tideLowFillStatic from './icons/fill/svg-static/tide-low.svg'
import tideLowLineAnimated from './icons/line/svg/tide-low.svg'
import tideLowLineStatic from './icons/line/svg-static/tide-low.svg'

const TIDE_ICONS = {
  high: {
    fill: { animated: tideHighFillAnimated, static: tideHighFillStatic },
    line: { animated: tideHighLineAnimated, static: tideHighLineStatic }
  },
  low: {
    fill: { animated: tideLowFillAnimated, static: tideLowFillStatic },
    line: { animated: tideLowLineAnimated, static: tideLowLineStatic }
  }
}

export function tideIcon (kind: 'high' | 'low', type: 'fill' | 'line', animationKind: 'animated' | 'static'): string {
  return TIDE_ICONS[kind][type][animationKind]
}
