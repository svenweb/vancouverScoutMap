import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import './App.css';
import { analyze } from './analyze';

// Fix for default marker icons in Leaflet with bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const CATEGORY_CONFIG = [
  { key: 'hospitals', label: 'Hospitals & Clinics', iconKey: 'hospital', color: '#ef4444', typeLabel: 'Hospital or Clinic' },
  { key: 'fire_stations', label: 'Fire Stations', iconKey: 'fire_station', color: '#f97316', typeLabel: 'Fire Station' },
  { key: 'police_stations', label: 'Police Stations', iconKey: 'police', color: '#3b82f6', typeLabel: 'Police Station' },
  { key: 'airports', label: 'Airports & Helipads', iconKey: 'airport', color: '#8b5cf6', typeLabel: 'Airport or Airfield' },
  { key: 'schools', label: 'Schools', iconKey: 'school', color: '#10b981', typeLabel: 'School' },
  { key: 'transit', label: 'Public Transport', iconKey: 'transit', color: '#0ea5e9', typeLabel: 'Transit Hub' },
  { key: 'construction', label: 'Construction Activity', iconKey: 'construction', color: '#facc15', typeLabel: 'Construction Site' },
  { key: 'traffic', label: 'Traffic Corridors', iconKey: 'traffic', color: '#94a3b8', typeLabel: 'Major Traffic Corridor' },
];

const CATEGORY_LOOKUP = CATEGORY_CONFIG.reduce((acc, item) => {
  acc[item.key] = item;
  return acc;
}, {});

const createEmptyFacilityState = () => CATEGORY_CONFIG.reduce((acc, { key }) => {
  acc[key] = [];
  return acc;
}, {});

const createZeroStats = () => CATEGORY_CONFIG.reduce((acc, { key }) => {
  acc[key] = 0;
  return acc;
}, {});

const VANCOUVER_BOUNDS = {
  minLat: 49.198,
  maxLat: 49.315,
  minLon: -123.27,
  maxLon: -123.02,
};

const GEOCODE_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'ScoutScape/1.0 (scoutscape.app contact@scoutscape.app)',
};

const GEOCODE_BASE_URL = 'https://geocode.maps.co';

const decodeBase64 = (value) => {
  if (!value) {
    return '';
  }

  try {
    if (typeof window !== 'undefined' && typeof window.atob === 'function') {
      return window.atob(value);
    }
  } catch (err) {
    // Ignore browser decoding errors and fall back to other strategies.
  }

  try {
    if (typeof atob === 'function') {
      return atob(value);
    }
  } catch (err) {
    // Ignore environment decoding errors and fall back to other strategies.
  }

  try {
    if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
      return Buffer.from(value, 'base64').toString('utf-8');
    }
  } catch (err) {
    // Ignore decoding errors and return an empty string.
  }

  return '';
};

const DEFAULT_TOMTOM_KEY = decodeBase64('QXlmMk85Y0lqNkN1Rll2N1pqRUpVVWFVMlM1dHhkVFE=');
const DEFAULT_GEMINI_KEY = decodeBase64('QUl6YVN5Qko0MFkzWWFlM0tteDl2VGV4blRiV3lzeENWdXFKT0dn');
const GEMINI_MODEL = 'gemini-2.5-flash-lite';

const ENV_TOMTOM_API_KEY = process.env.REACT_APP_TOMTOM_API_KEY;
const ENV_GEMINI_API_KEY = process.env.REACT_APP_GEMINI_API_KEY;

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
];

const OVERPASS_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded',
  Accept: 'application/json',
  'User-Agent': GEOCODE_HEADERS['User-Agent'],
};

const OVERPASS_RETRY_DELAYS = [0, 750, 2000, 4000];

const WEATHER_CODE_SUMMARY = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Rime fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Freezing rain',
  67: 'Heavy freezing rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Light showers',
  81: 'Showers',
  82: 'Heavy showers',
  85: 'Snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Severe thunderstorm',
};

const toRadians = (value) => (value * Math.PI) / 180;

const distanceInMeters = (lat1, lon1, lat2, lon2) => {
  const earthRadius = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadius * c);
};

const formatDistance = (meters) => {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${meters} m`;
};

const formatTimeSelection = (selection) => {
  if (!selection) {
    return 'Not specified';
  }
  return `${selection.hour12}:${selection.minutePadded} ${selection.period}`;
};

const getVancouverDateParts = () => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Vancouver',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  return {
    year: parts.find((part) => part.type === 'year')?.value || '2024',
    month: parts.find((part) => part.type === 'month')?.value || '01',
    day: parts.find((part) => part.type === 'day')?.value || '01',
  };
};

const getVancouverOffset = () => {
  const offsetPart = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Vancouver',
    timeZoneName: 'shortOffset',
  })
    .formatToParts(new Date())
    .find((part) => part.type === 'timeZoneName')?.value;

  const match = offsetPart?.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/i);
  if (match) {
    const sign = match[1].startsWith('-') ? '-' : '+';
    const rawHours = match[1].replace(/^[+-]/, '');
    const hours = rawHours.padStart(2, '0');
    const minutes = match[2] ? match[2].padStart(2, '0') : '00';
    return `${sign}${hours}:${minutes}`;
  }

  return '-07:00';
};

const createVancouverIsoDateTime = (hour24, minute) => {
  const { year, month, day } = getVancouverDateParts();
  const offset = getVancouverOffset();
  return `${year}-${month}-${day}T${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00${offset}`;
};

const buildGeminiPrompt = ({
  locationLabel,
  coordinates,
  radius,
  timeSelection,
  stats,
  facilities,
  traffic,
  weather,
}) => {
  const lines = [];
  lines.push('You are advising a film location scout in Vancouver, BC.');
  lines.push(
    'Summarize potential sound risks around the scouted address and recommend equipment to mitigate interference from those risks.'
  );
  lines.push('Respond in valid JSON with keys "summary" and "equipmentAdvice".');
  lines.push('Keep the summary concise (3-5 sentences) and focus on practical insights.');
  lines.push('Equipment advice should mention gear the crew should bring.');
  lines.push('');
  lines.push(`Scouted address or description: ${locationLabel}`);
  lines.push(`Coordinates: ${coordinates.lat.toFixed(5)}, ${coordinates.lon.toFixed(5)}`);
  lines.push(`Radius analysed: ${radius} meters.`);
  lines.push(`Time of interest: ${formatTimeSelection(timeSelection)}.`);

  const categoryDetails = Object.entries(stats)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => `${CATEGORY_LOOKUP[key].label}: ${value}`);
  if (categoryDetails.length) {
    lines.push('Facility counts within radius:');
    categoryDetails.forEach((line) => lines.push(`- ${line}`));
  } else {
    lines.push('No mapped facilities detected in the chosen radius.');
  }

  if (facilities.length) {
    lines.push('Notable nearby facilities:');
    facilities.slice(0, 15).forEach((facility) => {
      lines.push(
        `- ${facility.name} (${CATEGORY_LOOKUP[facility.categoryKey].label}) at ${formatDistance(
          facility.distance
        )}${facility.address ? `, address: ${facility.address}` : ''}`
      );
    });
  }

  if (traffic) {
    lines.push('TomTom traffic snapshot:');
    lines.push(
      `- Status: ${traffic.status}. Current speed ${traffic.currentSpeed} km/h, free flow ${traffic.freeFlowSpeed} km/h, delay ${traffic.delayDescription}, confidence ${traffic.confidence}.`
    );
    if (traffic.roadClosure) {
      lines.push('- TomTom detected a road closure in this segment.');
    }
  }

  if (weather) {
    lines.push('Weather at the selected time:');
    lines.push(
      `- ${weather.condition} with temperature ${weather.temperature}°C, wind ${weather.windSpeed} km/h from ${weather.windDirectionCardinal}.`
    );
  }

  lines.push('Always frame advice for film sound recording and mitigation.');

  return lines.join('\n');
};

const stripCodeFences = (value) =>
  value ? value.replace(/```(?:\w+)?/g, '').trim() : '';

const humanizeAdviceKey = (key) =>
  key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());

const buildAdviceItems = (value) => {
  if (!value || typeof value !== 'object') {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((entry, index) => {
        if (!entry) {
          return null;
        }
        if (typeof entry === 'string') {
          return {
            title: `Recommendation ${index + 1}`,
            detail: entry.trim(),
          };
        }
        if (typeof entry === 'object') {
          const [firstKey, firstValue] = Object.entries(entry)[0] || [];
          return {
            title: humanizeAdviceKey(firstKey || `Recommendation ${index + 1}`),
            detail:
              typeof firstValue === 'string'
                ? firstValue.trim()
                : JSON.stringify(firstValue),
          };
        }
        return {
          title: `Recommendation ${index + 1}`,
          detail: String(entry),
        };
      })
      .filter(Boolean);
  }

  return Object.entries(value).map(([key, detail]) => ({
    title: humanizeAdviceKey(key),
    detail: typeof detail === 'string' ? detail.trim() : JSON.stringify(detail),
  }));
};

const parseGeminiJson = (candidate) => {
  if (!candidate) {
    return null;
  }

  try {
    const parsed = JSON.parse(candidate);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (err) {
    return null;
  }

  return null;
};

const extractGeminiSections = (text) => {
  if (!text) {
    return { summary: '', equipmentAdvice: '', adviceItems: [], plainText: '' };
  }

  const stripped = stripCodeFences(text);
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const codeBlockContent = codeBlockMatch ? codeBlockMatch[1].trim() : null;
  const plainCandidate = (codeBlockContent || stripped || '').trim();

  const attemptJsonCandidates = [codeBlockContent, stripped, text];
  let parsed = null;
  for (const candidate of attemptJsonCandidates) {
    if (!parsed) {
      parsed = parseGeminiJson(candidate);
    }
  }

  if (!parsed) {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    parsed = parseGeminiJson(jsonMatch ? jsonMatch[0] : null);
  }

  if (parsed) {
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
    const adviceSource =
      parsed.equipmentAdvice ?? parsed.advice ?? parsed.recommendations ?? null;
    const adviceItems = buildAdviceItems(adviceSource);
    const equipmentAdvice =
      typeof adviceSource === 'string'
        ? adviceSource.trim()
        : adviceItems.length === 0 && adviceSource != null
        ? String(adviceSource)
        : '';

    return {
      summary,
      equipmentAdvice,
      adviceItems,
      plainText: plainCandidate,
    };
  }

  const lower = stripped.toLowerCase();
  const equipmentIndex = lower.indexOf('equipment');
  if (equipmentIndex >= 0) {
    return {
      summary: stripped.slice(0, equipmentIndex).trim(),
      equipmentAdvice: stripped.slice(equipmentIndex).trim(),
      adviceItems: [],
      plainText: plainCandidate,
    };
  }

  return {
    summary: stripped.trim(),
    equipmentAdvice: '',
    adviceItems: [],
    plainText: plainCandidate,
  };
};

const createBadgeIcon = (color, text) =>
  L.divIcon({
    html: `
      <div style="
        background:${color};
        width:26px;
        height:26px;
        border-radius:50%;
        border:2px solid #ffffff;
        display:flex;
        align-items:center;
        justify-content:center;
        color:#ffffff;
        font-size:12px;
        font-weight:700;
        box-shadow:0 0 0 2px rgba(15, 23, 42, 0.15);
      ">${text}</div>
    `,
    className: '',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });

const ICON_DEFINITIONS = {
  hospital: { color: '#ef4444', text: 'H' },
  fire_station: { color: '#f97316', text: 'F' },
  police: { color: '#3b82f6', text: 'P' },
  airport: { color: '#8b5cf6', text: 'A' },
  school: { color: '#10b981', text: 'S' },
  transit: { color: '#0ea5e9', text: 'T' },
  construction: { color: '#facc15', text: 'C' },
  traffic: { color: '#475569', text: 'Rd' },
};

const describeWeather = (code) => WEATHER_CODE_SUMMARY[code] || 'Conditions unavailable';

const parseTimeInput = (hourValue, minuteValue, periodValue) => {
  const hour = parseInt(hourValue, 10);
  const minute = parseInt(minuteValue, 10);

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return null;
  }

  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) {
    return null;
  }

  const normalizedPeriod = periodValue === 'AM' ? 'AM' : 'PM';
  let hour24 = hour % 12;

  if (normalizedPeriod === 'PM') {
    hour24 += 12;
  }

  if (normalizedPeriod === 'AM' && hour === 12) {
    hour24 = 0;
  }

  return {
    hour12: hour,
    hour24,
    minute,
    minutePadded: minute.toString().padStart(2, '0'),
    period: normalizedPeriod,
  };
};

const describeTrafficLevel = (data) => {
  if (!data || typeof data.currentSpeed !== 'number' || typeof data.freeFlowSpeed !== 'number') {
    return 'Unavailable';
  }

  if (data.currentSpeed <= 0 || data.freeFlowSpeed <= 0) {
    return 'Unavailable';
  }

  const ratio = data.currentSpeed / data.freeFlowSpeed;

  if (ratio >= 0.8) {
    return 'Light traffic';
  }

  if (ratio >= 0.55) {
    return 'Moderate traffic';
  }

  return 'Heavy congestion';
};

const formatTrafficDelay = (data) => {
  if (!data || typeof data.currentTravelTime !== 'number' || typeof data.freeFlowTravelTime !== 'number') {
    return '—';
  }

  const delaySeconds = Math.max(data.currentTravelTime - data.freeFlowTravelTime, 0);

  if (delaySeconds >= 60) {
    const minutes = delaySeconds / 60;
    if (minutes >= 10) {
      return `${Math.round(minutes)} min`;
    }
    return `${minutes.toFixed(1)} min`;
  }

  return `${Math.round(delaySeconds)} sec`;
};

const toCardinal = (degrees) => {
  if (typeof degrees !== 'number' || Number.isNaN(degrees)) {
    return 'N/A';
  }
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return directions[Math.round(degrees / 45) % 8];
};

const categorizeFacility = (tags = {}, elementType) => {
  if (!tags || tags.type === 'route' || tags.type === 'route_master') {
    return [];
  }

  const categories = new Set();
  const amenity = tags.amenity;
  const aeroway = tags.aeroway;
  const publicTransport = tags.public_transport;
  const highway = tags.highway;
  const railway = tags.railway;
  const construction = tags.construction;

  if (
    amenity === 'hospital' ||
    amenity === 'clinic' ||
    amenity === 'doctors' ||
    tags.healthcare === 'hospital'
  ) {
    categories.add('hospitals');
  }

  if (amenity === 'fire_station') {
    categories.add('fire_stations');
  }

  if (amenity === 'police') {
    categories.add('police_stations');
  }

  if (
    aeroway === 'aerodrome' ||
    aeroway === 'airport' ||
    aeroway === 'heliport' ||
    aeroway === 'helipad' ||
    aeroway === 'runway' ||
    aeroway === 'taxiway'
  ) {
    categories.add('airports');
  }

  if (
    amenity === 'school' ||
    amenity === 'college' ||
    amenity === 'university' ||
    amenity === 'kindergarten' ||
    tags.school ||
    tags['isced:level']
  ) {
    categories.add('schools');
  }

  if (
    amenity === 'bus_station' ||
    amenity === 'ferry_terminal' ||
    amenity === 'public_transport' ||
    publicTransport === 'station' ||
    publicTransport === 'stop_position' ||
    publicTransport === 'platform' ||
    publicTransport === 'stop_area' ||
    highway === 'bus_stop' ||
    railway === 'station' ||
    railway === 'stop' ||
    railway === 'halt' ||
    railway === 'tram_stop' ||
    railway === 'light_rail' ||
    railway === 'subway_entrance'
  ) {
    categories.add('transit');
  }

  if (tags.landuse === 'construction' || construction || tags.building === 'construction') {
    categories.add('construction');
  }

  if (
    highway &&
    ['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link'].includes(highway) &&
    elementType !== 'relation'
  ) {
    categories.add('traffic');
  }

  return Array.from(categories);
};

const FacilitiesMap = () => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef({});
  const selectedMarkerRef = useRef(null);
  const searchCircleRef = useRef(null);
  const previousLocationRef = useRef(null);
  const selectedLocationRef = useRef(null);
  const aggregatedFacilitiesRef = useRef([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [address, setAddress] = useState('');
  const [radius, setRadius] = useState(250);
  const [timeHour, setTimeHour] = useState('');
  const [timeMinute, setTimeMinute] = useState('');
  const [timePeriod, setTimePeriod] = useState('PM');
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [facilityData, setFacilityData] = useState(() => createEmptyFacilityState());
  const [stats, setStats] = useState(() => createZeroStats());
  const [visibleLayers, setVisibleLayers] = useState(() => {
    const initial = {};
    CATEGORY_CONFIG.forEach(({ key }) => {
      initial[key] = true;
    });
    return initial;
  });
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [addressError, setAddressError] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [geocoding, setGeocoding] = useState(false);
  const [weather, setWeather] = useState(null);
  const [trafficData, setTrafficData] = useState(null);
  const [trafficLoading, setTrafficLoading] = useState(false);
  const [trafficError, setTrafficError] = useState(null);
  const [geminiSummary, setGeminiSummary] = useState(null);
  const [geminiAdvice, setGeminiAdvice] = useState(null);
  const [geminiAdviceItems, setGeminiAdviceItems] = useState([]);
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [geminiError, setGeminiError] = useState(null);
  const [geminiFollowUp, setGeminiFollowUp] = useState('');
  const [geminiFollowUps, setGeminiFollowUps] = useState([]);
  const geminiThreadRef = useRef([]);

  const tomTomKey = useMemo(() => {
    if (ENV_TOMTOM_API_KEY) {
      return ENV_TOMTOM_API_KEY;
    }
    if (typeof window !== 'undefined' && window.__SCOUTSCAPE_KEYS__?.tomtom) {
      return window.__SCOUTSCAPE_KEYS__.tomtom;
    }
    return (DEFAULT_TOMTOM_KEY || '').trim();
  }, []);

  const geminiKey = useMemo(() => {
    if (ENV_GEMINI_API_KEY) {
      return ENV_GEMINI_API_KEY;
    }
    if (typeof window !== 'undefined' && window.__SCOUTSCAPE_KEYS__?.gemini) {
      return window.__SCOUTSCAPE_KEYS__.gemini;
    }
    return (DEFAULT_GEMINI_KEY || '').trim();
  }, []);

  const icons = useMemo(() => {
    const iconMap = {};
    Object.entries(ICON_DEFINITIONS).forEach(([key, definition]) => {
      iconMap[key] = createBadgeIcon(definition.color, definition.text);
    });
    return iconMap;
  }, []);

  const totalFacilities = useMemo(
    () => Object.values(stats).reduce((acc, value) => acc + value, 0),
    [stats]
  );

  const dominantCategory = useMemo(() => {
    let topKey = null;
    let topCount = 0;
    Object.entries(stats).forEach(([key, value]) => {
      if (value > topCount) {
        topKey = key;
        topCount = value;
      }
    });
    if (!topKey || topCount === 0) {
      return null;
    }
    return {
      key: topKey,
      count: topCount,
      label: CATEGORY_LOOKUP[topKey].label,
    };
  }, [stats]);

  const parsedTimeSelection = useMemo(
    () => parseTimeInput(timeHour, timeMinute, timePeriod),
    [timeHour, timeMinute, timePeriod]
  );

  const hasTimeInput = timeHour !== '' || timeMinute !== '';

  const trafficStatus = useMemo(() => describeTrafficLevel(trafficData), [trafficData]);

  const layerControls = useMemo(() => {
    if (!selectedLocation) {
      return CATEGORY_CONFIG;
    }
    return CATEGORY_CONFIG.filter(({ key }) => (stats[key] || 0) > 0);
  }, [selectedLocation, stats]);

  const weatherDisplayTime = useMemo(() => {
    if (!weather || !weather.time) {
      return null;
    }
    try {
      const date = new Date(`${weather.time}:00`);
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Vancouver',
        hour: 'numeric',
        minute: '2-digit',
      }).format(date);
    } catch (err) {
      return null;
    }
  }, [weather]);

  const isWithinVancouver = useCallback((lat, lon) => {
    if (typeof lat !== 'number' || typeof lon !== 'number' || Number.isNaN(lat) || Number.isNaN(lon)) {
      return false;
    }
    return (
      lat >= VANCOUVER_BOUNDS.minLat &&
      lat <= VANCOUVER_BOUNDS.maxLat &&
      lon >= VANCOUVER_BOUNDS.minLon &&
      lon <= VANCOUVER_BOUNDS.maxLon
    );
  }, []);

  useEffect(() => {
    selectedLocationRef.current = selectedLocation;
  }, [selectedLocation]);

  useEffect(() => {
    if (!mapInstanceRef.current) {
      const map = L.map(mapRef.current).setView([49.25, -123.1], 12);
      mapInstanceRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      const bounds = L.latLngBounds(
        [49.17, -123.32],
        [49.35, -122.95]
      );
      map.setMaxBounds(bounds);
      map.on('drag', () => {
        map.panInsideBounds(bounds, { animate: false });
      });

      markersRef.current = {};
      CATEGORY_CONFIG.forEach(({ key }) => {
        markersRef.current[key] = L.layerGroup().addTo(map);
      });

      const handleClick = (event) => {
        const { lat, lng } = event.latlng;
        if (isWithinVancouver(lat, lng)) {
          setSelectedLocation({ lat, lon: lng });
          setAddressError(null);
          setLocationError(null);
        } else {
          setLocationError('Selected point is outside Vancouver city limits.');
        }
      };

      map.on('click', handleClick);

      return () => {
        map.off('click', handleClick);
        map.remove();
        mapInstanceRef.current = null;
      };
    }
    return undefined;
  }, [isWithinVancouver]);

  const processFacilities = useCallback((elements) => {
    const nodeMap = {};
    elements.forEach((element) => {
      if (element.type === 'node') {
        nodeMap[element.id] = element;
      }
    });

    const grouped = createEmptyFacilityState();

    elements.forEach((element) => {
      if (!element.tags) {
        return;
      }

      const categories = categorizeFacility(element.tags, element.type);
      if (categories.length === 0) {
        return;
      }

      let lat;
      let lon;

      if (element.type === 'node') {
        lat = element.lat;
        lon = element.lon;
      } else if (element.center) {
        lat = element.center.lat;
        lon = element.center.lon;
      } else if (element.type === 'way' && element.nodes) {
        let sumLat = 0;
        let sumLon = 0;
        let count = 0;
        element.nodes.forEach((nodeId) => {
          const node = nodeMap[nodeId];
          if (node) {
            sumLat += node.lat;
            sumLon += node.lon;
            count += 1;
          }
        });
        if (count > 0) {
          lat = sumLat / count;
          lon = sumLon / count;
        }
      }

      if (typeof lat !== 'number' || typeof lon !== 'number') {
        return;
      }

      const name = element.tags.name || element.tags.ref || 'Unnamed';
      const addressLine =
        element.tags['addr:full'] ||
        [element.tags['addr:housenumber'], element.tags['addr:street']]
          .filter(Boolean)
          .join(' ') ||
        element.tags['addr:street'] ||
        '';

      const baseFacility = {
        id: element.id,
        lat,
        lon,
        tags: element.tags,
        name,
        address: addressLine,
      };

      categories.forEach((categoryKey) => {
        grouped[categoryKey].push({
          ...baseFacility,
          category: categoryKey,
        });
      });
    });

    setFacilityData(grouped);
  }, []);

  const handleMapClick = useCallback((e) => {
    if (isDroppingPin) {
      const { lat, lng } = e.latlng;
      setLatitude(lat.toFixed(6));
      setLongitude(lng.toFixed(6));
      setIsDroppingPin(false);
      
      // Reset cursor
      if (mapInstanceRef.current) {
        mapInstanceRef.current.getContainer().style.cursor = '';
      }

      // Add or update pin marker
      if (selectedPin) {
        mapInstanceRef.current.removeLayer(selectedPin);
      }
      
      const pinIcon = L.divIcon({
        html: '<div style="background: #ef4444; width: 20px; height: 20px; border-radius: 50% 50% 50% 0; border: 2px solid white; transform: rotate(-45deg); box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>',
        className: '',
        iconSize: [20, 20],
        iconAnchor: [10, 20],
      });

      const newPin = L.marker([lat, lng], { icon: pinIcon }).addTo(mapInstanceRef.current);
      setSelectedPin(newPin);
    }
  }, [isDroppingPin, selectedPin]);

  useEffect(() => {
    let cancelled = false;

    const fetchFacilities = async () => {
      setLoading(true);
      setError(null);

      const overpassQuery = `
        [out:json][timeout:60];
        area["name"="Vancouver"]["admin_level"="8"]["boundary"="administrative"]->.searchArea;
        (
          node["amenity"="hospital"](area.searchArea);
          way["amenity"="hospital"](area.searchArea);
          relation["amenity"="hospital"](area.searchArea);
          node["amenity"="clinic"](area.searchArea);
          way["amenity"="clinic"](area.searchArea);
          relation["amenity"="clinic"](area.searchArea);
          node["amenity"="doctors"](area.searchArea);

          node["amenity"="fire_station"](area.searchArea);
          way["amenity"="fire_station"](area.searchArea);
          relation["amenity"="fire_station"](area.searchArea);

          node["amenity"="police"](area.searchArea);
          way["amenity"="police"](area.searchArea);
          relation["amenity"="police"](area.searchArea);

          node["aeroway"~"aerodrome|airport|heliport|helipad|runway|taxiway"](area.searchArea);
          way["aeroway"~"aerodrome|airport|heliport|helipad|runway|taxiway"](area.searchArea);
          relation["aeroway"~"aerodrome|airport|heliport|helipad|runway|taxiway"](area.searchArea);

          node["amenity"~"school|college|university|kindergarten"](area.searchArea);
          way["amenity"~"school|college|university|kindergarten"](area.searchArea);
          relation["amenity"~"school|college|university|kindergarten"](area.searchArea);

          node["public_transport"](area.searchArea);
          way["public_transport"](area.searchArea);
          relation["public_transport"](area.searchArea);
          node["highway"="bus_stop"](area.searchArea);
          way["highway"="bus_stop"](area.searchArea);
          node["amenity"~"bus_station|ferry_terminal"](area.searchArea);
          way["amenity"~"bus_station|ferry_terminal"](area.searchArea);
          relation["amenity"~"bus_station|ferry_terminal"](area.searchArea);
          node["railway"~"station|stop|halt|tram_stop|light_rail|subway_entrance"](area.searchArea);
          way["railway"~"station|stop|halt|tram_stop|light_rail|subway_entrance"](area.searchArea);

          node["landuse"="construction"](area.searchArea);
          way["landuse"="construction"](area.searchArea);
          relation["landuse"="construction"](area.searchArea);
          node["building"="construction"](area.searchArea);
          way["building"="construction"](area.searchArea);
          relation["building"="construction"](area.searchArea);

          way["highway"~"motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link"](area.searchArea);
        );
        out center;
      `;

      try {
        let facilitiesLoaded = false;
        let lastError = null;

        overpassLoop: for (const endpoint of OVERPASS_ENDPOINTS) {
          for (let attempt = 0; attempt < OVERPASS_RETRY_DELAYS.length; attempt += 1) {
            const delay = OVERPASS_RETRY_DELAYS[attempt];
            if (delay > 0) {
              await new Promise((resolve) => setTimeout(resolve, delay));
            }

            if (cancelled) {
              break overpassLoop;
            }

            try {
              const response = await fetch(endpoint, {
                method: 'POST',
                headers: OVERPASS_HEADERS,
                body: `data=${encodeURIComponent(overpassQuery)}`,
              });

              if (cancelled) {
                break overpassLoop;
              }

              if (!response.ok) {
                const error = new Error('Failed to fetch data from Overpass API');
                error.status = response.status;
                lastError = error;

                if (response.status === 429 && attempt < OVERPASS_RETRY_DELAYS.length - 1) {
                  continue;
                }

                break;
              }

              const overpassData = await response.json();
              if (!cancelled) {
                processFacilities(overpassData.elements || []);
                facilitiesLoaded = true;
                lastError = null;
              }
              break overpassLoop;
            } catch (innerError) {
              lastError = innerError;

              if (attempt < OVERPASS_RETRY_DELAYS.length - 1) {
                continue;
              }

              break;
            }
          }
        }

        if (cancelled) {
          return;
        }

        if (!facilitiesLoaded) {
          throw lastError || new Error('Overpass data is temporarily unavailable. Try again shortly.');
        }

        if (!cancelled) {
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Overpass data is temporarily unavailable. Try again shortly.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchFacilities();
    return () => {
      cancelled = true;
    };
  }, [processFacilities]);
  useEffect(() => {
    if (!mapInstanceRef.current || !markersRef.current) {
      return;
    }

    if (!selectedLocation) {
      Object.values(markersRef.current).forEach((group) => {
        if (group) {
          group.clearLayers();
          if (mapInstanceRef.current.hasLayer(group)) {
            mapInstanceRef.current.removeLayer(group);
          }
        }
      });
      setStats(createZeroStats());
      aggregatedFacilitiesRef.current = [];
      return;
    }

    const map = mapInstanceRef.current;
    const newStats = createZeroStats();
    const aggregated = [];

    CATEGORY_CONFIG.forEach(({ key, iconKey, label, color, typeLabel }) => {
      const layerGroup = markersRef.current[key];
      if (!layerGroup) {
        return;
      }

      layerGroup.clearLayers();

      const facilities = facilityData[key] || [];
      const filtered = facilities
        .map((facility) => ({
          ...facility,
          distance: distanceInMeters(
            selectedLocation.lat,
            selectedLocation.lon,
            facility.lat,
            facility.lon
          ),
        }))
        .filter((facility) => facility.distance <= radius);

      newStats[key] = filtered.length;

      if (visibleLayers[key]) {
        if (!map.hasLayer(layerGroup)) {
          layerGroup.addTo(map);
        }

        filtered.forEach((facility) => {
          const marker = L.marker([facility.lat, facility.lon], {
            icon: icons[iconKey],
          });

          const addressLine = facility.address || 'Address not available';
          marker.bindPopup(`
            <div class="facility-popup">
              <h3>${facility.name}</h3>
              <p><strong>Type:</strong> ${typeLabel}</p>
              <p><strong>Address:</strong> ${addressLine}</p>
              <p><strong>Distance:</strong> ${formatDistance(facility.distance)}</p>
            </div>
          `);

          layerGroup.addLayer(marker);
        });
      } else if (map.hasLayer(layerGroup)) {
        map.removeLayer(layerGroup);
      }

      filtered.forEach((facility) => {
        aggregated.push({
          ...facility,
          categoryLabel: label,
          categoryKey: key,
          color,
        });
      });
    });

    aggregated.sort((a, b) => a.distance - b.distance);

    setStats(newStats);
    aggregatedFacilitiesRef.current = aggregated;
  }, [facilityData, icons, radius, selectedLocation, visibleLayers]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) {
      return;
    }

    if (!selectedLocation) {
      if (selectedMarkerRef.current) {
        selectedMarkerRef.current.off('dragend');
        map.removeLayer(selectedMarkerRef.current);
        selectedMarkerRef.current = null;
      }
      if (searchCircleRef.current) {
        map.removeLayer(searchCircleRef.current);
        searchCircleRef.current = null;
      }
      previousLocationRef.current = null;
      return;
    }

    const { lat, lon } = selectedLocation;

    if (!selectedMarkerRef.current) {
      const marker = L.marker([lat, lon], { draggable: true });
      marker.addTo(map);
      marker.on('dragend', (event) => {
        const { lat: dragLat, lng: dragLng } = event.target.getLatLng();
        if (isWithinVancouver(dragLat, dragLng)) {
          setSelectedLocation({ lat: dragLat, lon: dragLng });
          setLocationError(null);
        } else {
          if (selectedLocationRef.current) {
            event.target.setLatLng([
              selectedLocationRef.current.lat,
              selectedLocationRef.current.lon,
            ]);
          }
          setLocationError('Dragged point is outside Vancouver. The marker has been reset.');
        }
      });
      selectedMarkerRef.current = marker;
    } else {
      selectedMarkerRef.current.setLatLng([lat, lon]);
    }

    if (!searchCircleRef.current) {
      searchCircleRef.current = L.circle([lat, lon], {
        radius,
        color: '#2563eb',
        weight: 2,
        fillColor: '#3b82f6',
        fillOpacity: 0.12,
      }).addTo(map);
    } else {
      searchCircleRef.current.setLatLng([lat, lon]);
      searchCircleRef.current.setRadius(radius);
    }

    const previousLocation = previousLocationRef.current;
    if (!previousLocation || previousLocation.lat !== lat || previousLocation.lon !== lon) {
      map.flyTo([lat, lon], Math.max(map.getZoom(), 14), { duration: 0.6 });
      previousLocationRef.current = { lat, lon };
    }
  }, [isWithinVancouver, radius, selectedLocation]);

  useEffect(() => {
    if (!selectedLocation) {
      setWeather(null);
      return;
    }

    let cancelled = false;

    const fetchWeather = async () => {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${selectedLocation.lat}&longitude=${selectedLocation.lon}&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,weathercode&current_weather=true&timezone=America/Vancouver`;

      const response = await fetch(url).catch(() => null);
      if (cancelled) {
        return;
      }

      if (!response || !response.ok) {
        if (!cancelled) {
          setWeather(null);
        }
        return;
      }

      const weatherData = await response.json().catch(() => null);
      if (cancelled) {
        return;
      }

      if (!weatherData) {
        if (!cancelled) {
          setWeather(null);
        }
        return;
      }

      const hourlyTimes = weatherData?.hourly?.time || [];
      const hourlyTemps = weatherData?.hourly?.temperature_2m || [];
      const hourlyWindSpeeds = weatherData?.hourly?.wind_speed_10m || [];
      const hourlyWindDirections = weatherData?.hourly?.wind_direction_10m || [];
      const hourlyWeatherCodes = weatherData?.hourly?.weathercode || [];

      const timeTarget = parsedTimeSelection;
      let selectedWeather = null;

      if (timeTarget && hourlyTimes.length) {
        const offset = getVancouverOffset();
        const targetIso = createVancouverIsoDateTime(timeTarget.hour24, timeTarget.minute);
        let bestIndex = 0;
        let bestDiff = Infinity;

        hourlyTimes.forEach((time, index) => {
          const comparisonTime = new Date(`${time}:00${offset}`);
          const targetTime = new Date(targetIso);
          const diff = Math.abs(comparisonTime.getTime() - targetTime.getTime());
          if (diff < bestDiff) {
            bestDiff = diff;
            bestIndex = index;
          }
        });

        selectedWeather = {
          temperature: hourlyTemps[bestIndex],
          windSpeed: hourlyWindSpeeds[bestIndex],
          windDirection: hourlyWindDirections[bestIndex],
          condition: describeWeather(hourlyWeatherCodes[bestIndex]),
          time: hourlyTimes[bestIndex],
          source: 'hourly',
        };
      }

      if (!selectedWeather && weatherData?.current_weather) {
        selectedWeather = {
          temperature: weatherData.current_weather.temperature,
          windSpeed: weatherData.current_weather.windspeed,
          windDirection: weatherData.current_weather.winddirection,
          condition: describeWeather(weatherData.current_weather.weathercode),
          time: weatherData.current_weather.time,
          source: 'current',
        };
      }

      if (selectedWeather) {
        setWeather(selectedWeather);
      } else {
        setWeather(null);
      }
    };

    fetchWeather();

    return () => {
      cancelled = true;
    };
  }, [parsedTimeSelection, selectedLocation]);

  useEffect(() => {
    if (!selectedLocation) {
      setTrafficData(null);
      setTrafficError(null);
      setTrafficLoading(false);
      return;
    }

    if (!hasTimeInput) {
      setTrafficData(null);
      setTrafficError(null);
      setTrafficLoading(false);
      return;
    }

    if (!parsedTimeSelection) {
      setTrafficData(null);
      setTrafficLoading(false);
      setTrafficError('Enter a valid time to check TomTom traffic.');
      return;
    }

    let cancelled = false;

    const fetchTraffic = async () => {
      setTrafficLoading(true);
      setTrafficError(null);

      if (!tomTomKey) {
        if (!cancelled) {
          setTrafficData(null);
          setTrafficError('TomTom traffic insights are temporarily unavailable.');
          setTrafficLoading(false);
        }
        return;
      }

      try {
        const isoDateTime = createVancouverIsoDateTime(
          parsedTimeSelection.hour24,
          parsedTimeSelection.minute
        );
        const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=${selectedLocation.lat},${selectedLocation.lon}&unit=KMPH&key=${tomTomKey}&dateTime=${encodeURIComponent(
          isoDateTime
        )}`;
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error('Traffic data unavailable at the moment.');
        }
        const trafficJson = await response.json();
        if (!cancelled) {
          if (trafficJson?.flowSegmentData) {
            setTrafficData(trafficJson.flowSegmentData);
            setTrafficError(null);
          } else {
            setTrafficData(null);
            setTrafficError('No TomTom traffic data returned for this area.');
          }
        }
      } catch (err) {
        if (!cancelled) {
          setTrafficData(null);
          setTrafficError(err.message || 'Unable to load TomTom traffic right now.');
        }
      } finally {
        if (!cancelled) {
          setTrafficLoading(false);
        }
      }
    };

    fetchTraffic();

    return () => {
      cancelled = true;
    };
  }, [parsedTimeSelection, selectedLocation, hasTimeInput, tomTomKey]);

  useEffect(() => {
    if (!selectedLocation) {
      return;
    }

    let cancelled = false;

    const fetchAddress = async () => {
      try {
        const url = `${GEOCODE_BASE_URL}/reverse?format=json&lat=${selectedLocation.lat}&lon=${selectedLocation.lon}`;
        const response = await fetch(url, { headers: GEOCODE_HEADERS });
        if (!response.ok) {
          return;
        }
        const reverseData = await response.json();
        if (!cancelled && reverseData?.display_name) {
          setAddress(reverseData.display_name);
        }
      } catch (err) {
        // Ignore reverse geocoding errors silently
      }
    };

    fetchAddress();

    return () => {
      cancelled = true;
    };
  }, [selectedLocation]);

  useEffect(() => {
    setAnalysisResult(null);
    setGeminiSummary(null);
    setGeminiAdvice(null);
    setGeminiAdviceItems([]);
    setGeminiError(null);
    setGeminiFollowUps([]);
    setGeminiFollowUp('');
    geminiThreadRef.current = [];
  }, [selectedLocation, radius]);

  useEffect(() => {
    setAnalysisResult(null);
    setGeminiSummary(null);
    setGeminiAdvice(null);
    setGeminiAdviceItems([]);
    setGeminiError(null);
    setGeminiFollowUps([]);
    setGeminiFollowUp('');
    geminiThreadRef.current = [];
  }, [parsedTimeSelection]);

  const handleSearchAddress = async (event) => {
    event.preventDefault();
    if (!address.trim()) {
      setAddressError('Enter an address in Vancouver to search.');
      return;
    }

    setGeocoding(true);
    setAddressError(null);

    try {
      const query = `${address.trim()}, Vancouver, British Columbia, Canada`;
      const url = `${GEOCODE_BASE_URL}/search?format=json&limit=5&q=${encodeURIComponent(
        query
      )}`;
      const response = await fetch(url, { headers: GEOCODE_HEADERS });
      if (!response.ok) {
        throw new Error('Unable to reach the Vancouver geocoding service.');
      }
      const results = await response.json();
      if (!Array.isArray(results) || !results.length) {
        setAddressError('No Vancouver matches found for that address.');
        return;
      }
      const topMatch = results.find((result) => {
        const latValue = parseFloat(result.lat);
        const lonValue = parseFloat(result.lon);
        return isWithinVancouver(latValue, lonValue);
      }) || results[0];

      const lat = parseFloat(topMatch.lat);
      const lon = parseFloat(topMatch.lon);
      if (!isWithinVancouver(lat, lon)) {
        setAddressError('Please choose an address located within Vancouver, BC.');
        return;
      }
      setSelectedLocation({ lat, lon });
      setLocationError(null);
    } catch (err) {
      setAddressError(err.message || 'Address search failed. Try again in a moment.');
    } finally {
      setGeocoding(false);
    }
  };

  const toggleLayer = (category) => {
    setVisibleLayers((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const sendGeminiRequest = useCallback(
    async (messages) => {
      if (!geminiKey) {
        throw new Error('Google Gemini insights are temporarily unavailable.');
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: messages }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const message = errorData?.error?.message || 'Google Gemini request failed.';
        throw new Error(message);
      }

      const geminiData = await response.json();
      const text =
        geminiData?.candidates?.[0]?.content?.parts
          ?.map((part) => (typeof part.text === 'string' ? part.text : ''))
          .join(' ')
          .trim() || '';

      if (!text) {
        throw new Error('Google Gemini returned an empty response.');
      }

      return text;
    },
    [geminiKey]
  );

  const handleAnalyze = useCallback(async () => {
    if (!selectedLocation) {
      setLocationError('Choose a Vancouver location before running the analysis.');
      return;
    }

    setAnalyzing(true);
    setAnalysisResult(null);
    setGeminiSummary(null);
    setGeminiAdvice(null);
    setGeminiAdviceItems([]);
    setGeminiError(null);
    setGeminiFollowUps([]);
    setGeminiFollowUp('');
    geminiThreadRef.current = [];

    const total = Object.values(stats).reduce((acc, value) => acc + value, 0);
    let busiestKey = null;
    let busiestCount = 0;
    Object.entries(stats).forEach(([key, value]) => {
      if (value > busiestCount) {
        busiestKey = key;
        busiestCount = value;
      }
    });
    const busiest =
      busiestKey && busiestCount > 0
        ? {
            key: busiestKey,
            label: CATEGORY_LOOKUP[busiestKey].label,
            count: busiestCount,
          }
        : null;

    const timeSnapshot = parsedTimeSelection ? { ...parsedTimeSelection } : null;

    setAnalysisResult({
      total,
      radius,
      timeSelection: timeSnapshot,
      busiest,
    });

    const facilities = aggregatedFacilitiesRef.current.slice();

    const trafficSnapshot = trafficData
      ? {
          status: describeTrafficLevel(trafficData),
          currentSpeed:
            typeof trafficData.currentSpeed === 'number'
              ? Math.round(trafficData.currentSpeed)
              : 'unknown',
          freeFlowSpeed:
            typeof trafficData.freeFlowSpeed === 'number'
              ? Math.round(trafficData.freeFlowSpeed)
              : 'unknown',
          delayDescription: formatTrafficDelay(trafficData),
          confidence:
            typeof trafficData.confidence === 'number'
              ? `${Math.round(
                  Math.min(Math.max(trafficData.confidence, 0), 1) * 100
                )}%`
              : 'unknown',
          roadClosure: Boolean(trafficData.roadClosure),
        }
      : null;

    const weatherSnapshot = weather
      ? {
          temperature:
            typeof weather.temperature === 'number' ? Math.round(weather.temperature) : 'unknown',
          windSpeed: typeof weather.windSpeed === 'number' ? Math.round(weather.windSpeed) : 'unknown',
          windDirectionCardinal:
            typeof weather.windDirection === 'number'
              ? toCardinal(weather.windDirection)
              : 'variable',
          condition: weather.condition || 'Conditions unavailable',
        }
      : null;

    const locationLabel = address?.trim() || 'Selected coordinates inside Vancouver, BC';

    try {
      setGeminiLoading(true);
      const prompt = buildGeminiPrompt({
        locationLabel,
        coordinates: selectedLocation,
        radius,
        timeSelection: timeSnapshot,
        stats,
        facilities,
        traffic: trafficSnapshot,
        weather: weatherSnapshot,
      });

      const userMessage = { role: 'user', parts: [{ text: prompt }] };
      const responseText = await sendGeminiRequest([userMessage]);
      const { summary, equipmentAdvice, adviceItems } = extractGeminiSections(responseText);
      setGeminiSummary(
        summary || 'Gemini did not return a written summary for this analysis yet.'
      );
      const normalizedAdviceItems = adviceItems || [];
      setGeminiAdviceItems(normalizedAdviceItems);
      if (equipmentAdvice) {
        setGeminiAdvice(equipmentAdvice);
      } else if (normalizedAdviceItems.length > 0) {
        setGeminiAdvice('');
      } else {
        setGeminiAdvice(
          'Gemini did not return specific equipment recommendations. Consider bringing standard wind protection and directional microphones.'
        );
      }
      geminiThreadRef.current = [userMessage, { role: 'model', parts: [{ text: responseText }] }];
    } catch (err) {
      setGeminiError(err.message || 'Unable to retrieve Google Gemini summary.');
      geminiThreadRef.current = [];
    } finally {
      setGeminiLoading(false);
      setAnalyzing(false);
    }
  }, [
    address,
    parsedTimeSelection,
    radius,
    selectedLocation,
    sendGeminiRequest,
    stats,
    trafficData,
    weather,
  ]);

  const timeSelectionSummary = (result) => {
    if (!result || !result.timeSelection) {
      return 'Not specified';
    }
    return formatTimeSelection(result.timeSelection);
  };

  const handleGeminiFollowUpSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      if (!geminiSummary || !geminiFollowUp.trim() || geminiLoading) {
        return;
      }

      const question = geminiFollowUp.trim();

      try {
        setGeminiLoading(true);
        const userMessage = {
          role: 'user',
          parts: [
            {
              text: `Follow-up question from the scout based on the previous summary and advice: ${question}`,
            },
          ],
        };
        const responseText = await sendGeminiRequest([...geminiThreadRef.current, userMessage]);
        const trimmedResponse = responseText.trim();
        const parsedFollowUp = extractGeminiSections(trimmedResponse);
        geminiThreadRef.current = [
          ...geminiThreadRef.current,
          userMessage,
          { role: 'model', parts: [{ text: trimmedResponse }] },
        ];
        setGeminiFollowUps((prev) => [
          ...prev,
          {
            question,
            answer: trimmedResponse,
            summary: parsedFollowUp.summary,
            advice: parsedFollowUp.equipmentAdvice,
            adviceItems: parsedFollowUp.adviceItems || [],
            plainText: parsedFollowUp.plainText,
          },
        ]);
        setGeminiFollowUp('');
      } catch (err) {
        setGeminiError(err.message || 'Unable to retrieve follow-up guidance from Google Gemini.');
      } finally {
        setGeminiLoading(false);
      }
    },
    [geminiFollowUp, geminiLoading, geminiSummary, sendGeminiRequest]
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div>
          <h1>ScoutScape</h1>
          <p>Scout Vancouver film locations with nearby noise sources, TomTom traffic, and live conditions.</p>
        </div>
      </header>

      {loading && (
        <div className="banner banner--info">Loading facilities from OpenStreetMap…</div>
      )}

      {error && (
        <div className="banner banner--error">{error}</div>
      )}

      <div className="layout">
        <aside className="sidebar-panel">
          <div className="sidebar-card">
            <h2>Add location</h2>
            <form className="location-form" onSubmit={handleSearchAddress}>
              <label className="field-label" htmlFor="address-input">
                Address or place
              </label>
              <div className="input-wrapper">
                <input
                  id="address-input"
                  type="text"
                  placeholder="Search for a Vancouver address…"
                  value={address}
                  onChange={(event) => {
                    setAddress(event.target.value);
                    if (addressError) {
                      setAddressError(null);
                    }
                  }}
                />
              </div>
              <button type="submit" className="search-button" disabled={geocoding}>
                {geocoding ? 'Searching…' : 'Find in Vancouver'}
              </button>
            </form>
            {addressError && <p className="input-error">{addressError}</p>}

            {locationError && <p className="input-error">{locationError}</p>}
            <p className="helper-text">Click on the map or drag the marker to refine the scouting pin.</p>

            <label className="field-label">Radius (m)</label>
            <div className="radius-control">
              <input
                type="range"
                min="50"
                max="1500"
                step="10"
                value={radius}
                onChange={(event) => setRadius(parseInt(event.target.value, 10))}
              />
              <span>{radius}</span>
            </div>

            <label className="field-label">Traffic check time</label>
            <div className="time-entry">
              <div className="time-entry-fields">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  placeholder="hh"
                  value={timeHour}
                  onChange={(event) => {
                    const value = event.target.value.replace(/[^0-9]/g, '').slice(0, 2);
                    setTimeHour(value);
                  }}
                />
                <span className="time-separator">:</span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  placeholder="mm"
                  value={timeMinute}
                  onChange={(event) => {
                    const value = event.target.value.replace(/[^0-9]/g, '').slice(0, 2);
                    setTimeMinute(value);
                  }}
                />
              </div>
              <div className="time-period-toggle" role="group" aria-label="Select AM or PM">
                <button
                  type="button"
                  className={`period-button ${timePeriod === 'AM' ? 'active' : ''}`}
                  aria-pressed={timePeriod === 'AM'}
                  onClick={() => setTimePeriod('AM')}
                >
                  AM
                </button>
                <button
                  type="button"
                  className={`period-button ${timePeriod === 'PM' ? 'active' : ''}`}
                  aria-pressed={timePeriod === 'PM'}
                  onClick={() => setTimePeriod('PM')}
                >
                  PM
                </button>
              </div>
            </div>
            {(timeHour !== '' || timeMinute !== '') && !parsedTimeSelection && (
              <p className="input-error">Enter a valid Vancouver time between 1-12 hours and 0-59 minutes.</p>
            )}
            <p className="helper-text helper-text--muted">
              Choose a local time to review TomTom traffic around your scouting pin.
            </p>

            <button
              onClick={handleAnalyze}
              disabled={analyzing || geminiLoading}
              className="analyze-button"
            >
              {analyzing ? (
                <>
                  <div className="spinner"></div>
                  Analyzing…
                </>
              ) : (
                'Analyze sound'
              )}
            </button>
          </div>

          <div className="sidebar-stats">
            <div>
              <span className="stats-label">Total Facilities</span>
              <span className="stats-value">{totalFacilities}</span>
            </div>
            {dominantCategory ? (
              <div>
                <span className="stats-label">Most common nearby</span>
                <span className="stats-value stats-value--muted">{dominantCategory.label}</span>
              </div>
            ) : (
              <p className="stats-empty">Select a Vancouver location to populate nearby services.</p>
            )}
            <p>Data from OpenStreetMap via Overpass API</p>
          </div>
        </aside>

        <main className="main-column">
          <div className="map-shell">
            <div ref={mapRef} className="map-instance" />
            <div className="map-grid-overlay"></div>
            <div className="map-radar map-radar--outer"></div>
            <div className="map-radar map-radar--middle"></div>
            <div className="map-radar map-radar--inner"></div>
            <div className="map-radar-dot"></div>

            <div className="map-layer-controls">
              <h3>Layer controls</h3>
              <p>Toggle categories to focus your scouting results.</p>
              {selectedLocation && layerControls.length === 0 ? (
                <p className="layer-empty">No mapped categories currently fall within this radius.</p>
              ) : (
                layerControls.map(({ key, label, color }) => (
                  <div
                    key={key}
                    onClick={() => toggleLayer(key)}
                    className={`layer-item ${visibleLayers[key] ? 'active' : ''}`}
                    style={{ borderColor: visibleLayers[key] ? color : '#e2e8f0' }}
                  >
                    <div className="layer-label">
                      <div
                        className="layer-color"
                        style={{ background: color, opacity: visibleLayers[key] ? 1 : 0.3 }}
                      ></div>
                      <span>{label}</span>
                    </div>
                    <span
                      className="layer-count"
                      style={{ color, background: `${color}20` }}
                    >
                      {stats[key] || 0}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="gemini-card">
            <div className="gemini-card-header">
              <h3>Gemini scouting brief</h3>
              {geminiLoading && <span className="gemini-status">Generating…</span>}
            </div>
            {analysisResult ? (
              geminiError ? (
                <p className="gemini-message gemini-message--error">{geminiError}</p>
              ) : geminiSummary || geminiLoading ? (
                <div className="gemini-content">
                  {geminiSummary && (
                    <div className="gemini-section">
                      <h4>Summary</h4>
                      <p>{geminiSummary}</p>
                    </div>
                  )}
                  {geminiAdvice && (
                    <div className="gemini-section">
                      <h4>Equipment advice</h4>
                      <p>{geminiAdvice}</p>
                    </div>
                  )}
                  {geminiAdviceItems.length > 0 && (
                    <div className="gemini-section">
                      <h4>Equipment advice</h4>
                      <dl className="gemini-advice-list">
                        {geminiAdviceItems.map((item, itemIndex) => (
                          <div key={`${item.title}-${itemIndex}`} className="gemini-advice-item">
                            <dt>{item.title}</dt>
                            <dd>{item.detail}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}
                  {geminiFollowUps.length > 0 && (
                    <div className="gemini-section">
                      <h4>Follow-up guidance</h4>
                      <ul className="gemini-followups">
                        {geminiFollowUps.map((entry, index) => (
                          <li
                            key={`${index}-${entry.question.slice(0, 12)}`}
                            className="gemini-followup-entry"
                          >
                            <div className="gemini-followup-question">
                              <span className="gemini-followup-label">Scout</span>
                              <p>{entry.question}</p>
                            </div>
                            <div className="gemini-followup-answer">
                              <span className="gemini-followup-label">Gemini</span>
                              {entry.summary && (
                                <p className="gemini-followup-summary">{entry.summary}</p>
                              )}
                              {entry.adviceItems?.length > 0 ? (
                                <dl className="gemini-advice-list gemini-advice-list--nested">
                                  {entry.adviceItems.map((item, itemIndex) => (
                                    <div
                                      key={`${item.title}-${itemIndex}`}
                                      className="gemini-advice-item"
                                    >
                                      <dt>{item.title}</dt>
                                      <dd>{item.detail}</dd>
                                    </div>
                                  ))}
                                </dl>
                              ) : entry.advice ? (
                                <p className="gemini-followup-advice">{entry.advice}</p>
                              ) : entry.plainText ? (
                                <p className="gemini-followup-advice">{entry.plainText}</p>
                              ) : (
                                <p className="gemini-followup-advice">{entry.answer}</p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <form className="gemini-followup-form" onSubmit={handleGeminiFollowUpSubmit}>
                    <label htmlFor="gemini-followup">Ask Gemini for more tailored advice</label>
                    <div className="followup-row">
                      <input
                        id="gemini-followup"
                        type="text"
                        value={geminiFollowUp}
                        onChange={(event) => setGeminiFollowUp(event.target.value)}
                        placeholder="Ask about mitigating a specific concern…"
                        disabled={geminiLoading || !geminiSummary}
                      />
                      <button type="submit" disabled={geminiLoading || !geminiSummary}>
                        Send
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <p className="gemini-message">Google Gemini is preparing your scouting brief…</p>
              )
            ) : (
              <p className="gemini-message">
                Run the sound analysis to generate a Gemini summary and tailored equipment recommendations.
              </p>
            )}
          </div>

          <div className="insight-grid">
            <div className="traffic-card">
              <h3>TomTom traffic</h3>
              {selectedLocation ? (
                trafficLoading ? (
                  <div className="traffic-loading">
                    <div className="spinner"></div>
                    <span>Loading TomTom traffic…</span>
                  </div>
                ) : trafficError ? (
                  <p className="traffic-message traffic-message--error">{trafficError}</p>
                ) : trafficData ? (
                  <>
                    {trafficStatus !== 'Unavailable' && (
                      <p className="traffic-status">{trafficStatus}</p>
                    )}
                    <div className="traffic-grid">
                      <div className="traffic-metric">
                        <span className="traffic-label">Speed now</span>
                        <span className="traffic-value">
                          {typeof trafficData.currentSpeed === 'number'
                            ? `${Math.round(trafficData.currentSpeed)} km/h`
                            : '—'}
                        </span>
                      </div>
                      <div className="traffic-metric">
                        <span className="traffic-label">Free flow</span>
                        <span className="traffic-value">
                          {typeof trafficData.freeFlowSpeed === 'number'
                            ? `${Math.round(trafficData.freeFlowSpeed)} km/h`
                            : '—'}
                        </span>
                      </div>
                      <div className="traffic-metric">
                        <span className="traffic-label">Delay</span>
                        <span className="traffic-value">{formatTrafficDelay(trafficData)}</span>
                      </div>
                      <div className="traffic-metric">
                        <span className="traffic-label">Confidence</span>
                        <span className="traffic-value">
                          {typeof trafficData.confidence === 'number'
                            ? `${Math.round(Math.min(Math.max(trafficData.confidence, 0), 1) * 100)}%`
                            : '—'}
                        </span>
                      </div>
                    </div>
                    {trafficData.roadClosure && (
                      <p className="traffic-message traffic-message--warning">
                        TomTom reports a road closure in this segment.
                      </p>
                    )}
                  </>
                ) : hasTimeInput ? (
                  <p className="traffic-message">TomTom returned no flow data for this time.</p>
                ) : (
                  <p className="traffic-message">Enter a Vancouver time to load TomTom traffic for this area.</p>
                )
              ) : (
                <p className="traffic-message">Select a Vancouver location to unlock TomTom traffic insights.</p>
              )}
            </div>

            <div className="weather-card">
              <h3>Conditions at selected time</h3>
              {weather ? (
                <>
                  {weatherDisplayTime && (
                    <p className="weather-timestamp">
                      {weather.source === 'hourly'
                        ? `Forecast for ${weatherDisplayTime}`
                        : `Current as of ${weatherDisplayTime}`}
                    </p>
                  )}
                  <div className="weather-grid">
                    <div className="weather-metric">
                      <span className="weather-label">Temperature</span>
                      <span className="weather-value">
                        {typeof weather.temperature === 'number'
                          ? `${Math.round(weather.temperature)}°C`
                          : '—'}
                      </span>
                    </div>
                    <div className="weather-metric">
                      <span className="weather-label">Wind</span>
                      <span className="weather-value">
                        {typeof weather.windSpeed === 'number'
                          ? `${Math.round(weather.windSpeed)} km/h ${
                              typeof weather.windDirection === 'number'
                                ? toCardinal(weather.windDirection)
                                : 'variable'
                            }`
                          : '—'}
                      </span>
                    </div>
                    <div className="weather-metric">
                      <span className="weather-label">Conditions</span>
                      <span className="weather-value">{weather.condition}</span>
                    </div>
                  </div>
                </>
              ) : (
                <p className="weather-placeholder">
                  Select a Vancouver location and time to preview filming conditions.
                </p>
              )}
            </div>

            <div className="report-card">
              <div>
                <h3>Report summary</h3>
                {analysisResult ? (
                  <>
                    <p>
                      {analysisResult.total > 0
                        ? `We detected ${analysisResult.total} potential noise sources within ${analysisResult.radius} m of the scouted pin.`
                        : 'No significant facilities were detected inside the selected radius.'}
                      {analysisResult.busiest
                        ? ` The most frequent category is ${analysisResult.busiest.label} (${analysisResult.busiest.count}).`
                        : ''}
                    </p>
                    <ul className="analysis-summary">
                      <li>Radius: {analysisResult.radius} m</li>
                      <li>Traffic time: {timeSelectionSummary(analysisResult)}</li>
                      <li>Categories monitored: {CATEGORY_CONFIG.length}</li>
                    </ul>
                  </>
                ) : (
                  <p>
                    Run the sound analysis to generate an overview of notable facilities within the selected
                    radius and traffic snapshot time.
                  </p>
                )}
              </div>
              <div className="report-actions">
                <button type="button" className="outline-button">
                  Export PDF
                </button>
                <button type="button" className="primary-button">
                  Save to Project
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default FacilitiesMap;
