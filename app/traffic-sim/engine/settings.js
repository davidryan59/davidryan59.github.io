/* Settings files. A settings file describes a run exactly: the road, the
   mix of drivers, the seed, and every parameter of every driver type,
   including each distribution that human traits are drawn from. Published
   results ship with their settings files, so anyone can rebuild every
   driver. The files live in app/traffic-sim/settings/.

   Every quantity with a dimension is a string that names its unit, such as
   "111 km/h", "0.17 g" or "1.2 s". readSettings() turns them into SI units,
   which the engine uses throughout. A file may leave parameters out, and
   those take the engine's defaults; missingParams() lists them, and a
   published settings file leaves none out. */

import { DEFAULTS } from './drivers.js';

export const G = 9.80665;   // standard gravity (m/s²)

const UNITS = {
  '': x => x,
  'm': x => x, 'km': x => x * 1000,
  's': x => x,
  'm/s': x => x, 'km/h': x => x / 3.6, 'mph': x => x * 0.44704,
  'm/s²': x => x, 'g': x => x * G,
  '/s': x => x, '/s²': x => x
};
// Keys whose values are words, never quantities.
const WORDS = new Set(['settings', 'name', 'about', 'source', 'dist', 'layout', 'reactionAs']);

// "111 km/h" -> 30.833… (m/s). A plain number has no dimension and stays as it is.
export function quantity(value) {
  if (typeof value === 'number') return value;
  const m = /^\s*(-?\d+(?:\.\d+)?(?:e-?\d+)?)\s*(\S*)\s*$/.exec(value);
  if (!m || !(m[2] in UNITS)) throw new Error(`not a quantity with a known unit: "${value}"`);
  return UNITS[m[2]](Number(m[1]));
}

function toSI(value, key) {
  if (WORDS.has(key) || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.map(x => toSI(x));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = toSI(v, k);
    return out;
  }
  return quantity(value);
}

/* A settings file, as text or as parsed JSON, in SI units:
   { name, about, seed, road: { layout, lanes, laneLength, density, keepLeft },
     mix: { coordinated, selfish, absorb }, params }
   density is in cars per km per lane. params goes to new Ring({ params }). */
export function readSettings(file) {
  const f = typeof file === 'string' ? JSON.parse(file) : file;
  const road = f.road || {}, mix = f.mix || {};
  return {
    name: f.name || '',
    about: f.about || '',
    seed: f.seed ?? 1,
    road: {
      layout: road.layout || 'ring',
      lanes: road.lanes ?? 1,
      laneLength: road.laneLength === undefined ? 800 : quantity(road.laneLength),
      density: road.density ?? 45,
      keepLeft: road.keepLeft ?? true
    },
    mix: { coordinated: mix.coordinated ?? 0, selfish: mix.selfish ?? 0, absorb: mix.absorb ?? false },
    params: toSI(f.params || {})
  };
}

// The parameters, as paths such as "human.traits.timeGap", that a settings
// file leaves to the engine's defaults.
export function missingParams(file) {
  const f = typeof file === 'string' ? JSON.parse(file) : file;
  const out = [];
  const walk = (base, given, path) => {
    for (const key of Object.keys(base)) {
      const p = path ? `${path}.${key}` : key;
      if (!given || given[key] === undefined) out.push(p);
      else if (base[key] && typeof base[key] === 'object' && !('dist' in base[key])) walk(base[key], given[key], p);
    }
  };
  walk(DEFAULTS, f.params, '');
  return out;
}
