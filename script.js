const STORAGE_KEY = 'world-clock-state-v2';
const MAX_ZONES = 12;
const MAX_RECENT_ITEMS = 6;
const MILLIS_PER_MINUTE = 60_000;
const MAX_OFFSET_ITERATIONS = 3;
// Matches offsets like GMT+05:30, GMT-08, GMT+0.
const GMT_OFFSET_PATTERN = /GMT([+-])(\d{1,2})(?::(\d{2}))?/;
const USER_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

const TIMEZONE_CATALOG = [
  { iana: 'UTC', city: 'UTC', region: 'Global', country: 'International', sunrise: '--:--', sunset: '--:--', popular: true },
  { iana: 'America/New_York', city: 'New York', region: 'North America', country: 'USA', sunrise: '05:40', sunset: '20:15', popular: true },
  { iana: 'America/Los_Angeles', city: 'Los Angeles', region: 'North America', country: 'USA', sunrise: '05:45', sunset: '20:05', popular: true },
  { iana: 'America/Chicago', city: 'Chicago', region: 'North America', country: 'USA', sunrise: '05:20', sunset: '20:29', popular: true },
  { iana: 'Europe/London', city: 'London', region: 'Europe', country: 'UK', sunrise: '04:45', sunset: '21:20', popular: true },
  { iana: 'Europe/Paris', city: 'Paris', region: 'Europe', country: 'France', sunrise: '05:47', sunset: '21:56', popular: true },
  { iana: 'Europe/Berlin', city: 'Berlin', region: 'Europe', country: 'Germany', sunrise: '04:45', sunset: '21:33', popular: false },
  { iana: 'Asia/Tokyo', city: 'Tokyo', region: 'Asia', country: 'Japan', sunrise: '04:26', sunset: '19:00', popular: true },
  { iana: 'Asia/Singapore', city: 'Singapore', region: 'Asia', country: 'Singapore', sunrise: '06:55', sunset: '19:12', popular: true },
  { iana: 'Asia/Dubai', city: 'Dubai', region: 'Middle East', country: 'UAE', sunrise: '05:30', sunset: '19:10', popular: false },
  { iana: 'Asia/Kolkata', city: 'Mumbai', region: 'Asia', country: 'India', sunrise: '06:02', sunset: '19:16', popular: false },
  { iana: 'Australia/Sydney', city: 'Sydney', region: 'Oceania', country: 'Australia', sunrise: '06:58', sunset: '16:54', popular: true },
  { iana: 'Pacific/Auckland', city: 'Auckland', region: 'Oceania', country: 'New Zealand', sunrise: '07:34', sunset: '17:12', popular: false },
  { iana: 'America/Sao_Paulo', city: 'Sao Paulo', region: 'South America', country: 'Brazil', sunrise: '06:46', sunset: '17:29', popular: false },
  { iana: 'Africa/Johannesburg', city: 'Johannesburg', region: 'Africa', country: 'South Africa', sunrise: '06:53', sunset: '17:24', popular: false },
];

const DEFAULT_ZONES = ['UTC', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo'];

const formatterCache = new Map();

const state = {
  zones: [...DEFAULT_ZONES],
  favorites: [],
  recent: [],
  hour12: false,
  lightTheme: false,
  layout: 'grid',
  clockStyle: 'both',
  clockSize: 'normal',
  font: 'system',
  accent: '#53d8fb',
  autoUpdate: true,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function safeCatalogItem(iana) {
  return TIMEZONE_CATALOG.find((zone) => zone.iana === iana) || {
    iana,
    city: iana.split('/').pop().replace(/_/g, ' '),
    region: 'Unknown',
    country: 'Unknown',
    sunrise: '--:--',
    sunset: '--:--',
    popular: false,
  };
}

function isValidTimezone(iana) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: iana }).format(new Date());
    return true;
  } catch (_) {
    return false;
  }
}

function getFormatter(timeZone, options) {
  const key = `${timeZone}:${JSON.stringify(options)}`;
  if (!formatterCache.has(key)) {
    formatterCache.set(
      key,
      new Intl.DateTimeFormat('en-GB', {
        timeZone,
        ...options,
      })
    );
  }
  return formatterCache.get(key);
}

function getTimeForZone(iana, date, hour12 = false) {
  return getFormatter(iana, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12,
  }).format(date);
}

function getDateForZone(iana, date) {
  return getFormatter(iana, {
    weekday: 'short',
    month: 'short',
    day: '2-digit',
  }).format(date);
}

function getPartsForZone(iana, date) {
  const parts = getFormatter(iana, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const hour = parts.find((part) => part.type === 'hour')?.value || '0';
  const minute = parts.find((part) => part.type === 'minute')?.value || '0';
  const second = parts.find((part) => part.type === 'second')?.value || '0';
  return {
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
  };
}

function getOffsetMinutes(iana, date = new Date()) {
  const label = getFormatter(iana, { timeZoneName: 'shortOffset' })
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')?.value;

  if (!label || label === 'GMT') {
    return 0;
  }

  const match = label.match(GMT_OFFSET_PATTERN);
  if (!match) {
    return 0;
  }

  const [, sign, h, m] = match;
  const total = Number(h) * 60 + Number(m || 0);
  return sign === '-' ? -total : total;
}

function formatOffset(minutes) {
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  const hours = String(Math.floor(abs / 60)).padStart(2, '0');
  const mins = String(abs % 60).padStart(2, '0');
  return `UTC${sign}${hours}:${mins}`;
}

function computeDifferenceHours(fromIana, toIana, date = new Date()) {
  const diffMinutes = getOffsetMinutes(toIana, date) - getOffsetMinutes(fromIana, date);
  return diffMinutes / 60;
}

function roundToStep(date, stepMinutes) {
  const rounded = new Date(date);
  rounded.setSeconds(0, 0);
  const current = rounded.getMinutes();
  const next = Math.ceil(current / stepMinutes) * stepMinutes;
  rounded.setMinutes(next);
  return rounded;
}

function isWithinWindow(localMinutes, startHour, endHour, durationMinutes) {
  const start = startHour * 60;
  const end = endHour * 60;
  return localMinutes >= start && localMinutes + durationMinutes <= end;
}

function calculateMeetingSlots(zones, options = {}, now = new Date()) {
  const startHour = clamp(Number(options.startHour ?? 9), 0, 23);
  const endHour = clamp(Number(options.endHour ?? 17), 1, 24);
  const durationMinutes = clamp(Number(options.durationMinutes ?? 60), 15, 180);
  const lookAheadHours = clamp(Number(options.lookAheadHours ?? 24), 1, 72);
  const stepMinutes = clamp(Number(options.stepMinutes ?? 30), 15, 60);

  if (!zones.length || endHour <= startHour) {
    return [];
  }

  const start = roundToStep(now, stepMinutes);
  const candidates = [];

  for (let mins = 0; mins <= lookAheadHours * 60; mins += stepMinutes) {
    const candidate = new Date(start.getTime() + mins * MILLIS_PER_MINUTE);
    const matches = zones.filter((iana) => {
      const parts = getPartsForZone(iana, candidate);
      const localMinutes = parts.hour * 60 + parts.minute;
      return isWithinWindow(localMinutes, startHour, endHour, durationMinutes);
    });

    if (matches.length) {
      candidates.push({
        date: candidate,
        matchCount: matches.length,
        matches,
      });
    }
  }

  return candidates
    .sort((a, b) => (b.matchCount - a.matchCount) || (a.date - b.date))
    .slice(0, 5);
}

function searchTimezones(query) {
  const term = query.trim().toLowerCase();
  if (!term) {
    return [];
  }

  return TIMEZONE_CATALOG.filter((zone) => {
    const hay = `${zone.city} ${zone.region} ${zone.country} ${zone.iana}`.toLowerCase();
    return hay.includes(term);
  }).slice(0, 8);
}

function loadState() {
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.zones)) state.zones = parsed.zones;
      if (Array.isArray(parsed.favorites)) state.favorites = parsed.favorites;
      if (Array.isArray(parsed.recent)) state.recent = parsed.recent;
      if (typeof parsed.hour12 === 'boolean') state.hour12 = parsed.hour12;
      if (typeof parsed.lightTheme === 'boolean') state.lightTheme = parsed.lightTheme;
      if (typeof parsed.layout === 'string') state.layout = parsed.layout;
      if (typeof parsed.clockStyle === 'string') state.clockStyle = parsed.clockStyle;
      if (typeof parsed.clockSize === 'string') state.clockSize = parsed.clockSize;
      if (typeof parsed.font === 'string') state.font = parsed.font;
      if (typeof parsed.accent === 'string') state.accent = parsed.accent;
      if (typeof parsed.autoUpdate === 'boolean') state.autoUpdate = parsed.autoUpdate;
    }
  } catch (_) {
    // ignore malformed state
  }

  state.zones = state.zones.filter((zone) => isValidTimezone(zone)).slice(0, MAX_ZONES);
  if (!state.zones.length) {
    state.zones = [...DEFAULT_ZONES];
  }
}

function saveState() {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      zones: state.zones,
      favorites: state.favorites,
      recent: state.recent,
      hour12: state.hour12,
      lightTheme: state.lightTheme,
      layout: state.layout,
      clockStyle: state.clockStyle,
      clockSize: state.clockSize,
      font: state.font,
      accent: state.accent,
      autoUpdate: state.autoUpdate,
    })
  );
}

function setRecent(iana) {
  state.recent = [iana, ...state.recent.filter((item) => item !== iana)].slice(0, MAX_RECENT_ITEMS);
}

function addTimezone(iana) {
  if (!state.zones.includes(iana) && state.zones.length < MAX_ZONES) {
    state.zones.push(iana);
    setRecent(iana);
    renderAll();
    saveState();
  }
}

function removeTimezone(iana) {
  state.zones = state.zones.filter((zone) => zone !== iana);
  state.favorites = state.favorites.filter((zone) => zone !== iana);
  renderAll();
  saveState();
}

function toggleFavorite(iana) {
  if (state.favorites.includes(iana)) {
    state.favorites = state.favorites.filter((zone) => zone !== iana);
  } else {
    state.favorites = [...state.favorites, iana];
  }
  renderAll();
  saveState();
}

function sortedZones() {
  return [...state.zones].sort((a, b) => {
    const aFav = state.favorites.includes(a) ? 1 : 0;
    const bFav = state.favorites.includes(b) ? 1 : 0;
    return bFav - aFav;
  });
}

function applyClassGroup(prefix, options, value) {
  options.forEach((option) => {
    document.body.classList.remove(`${prefix}-${option}`);
  });
  document.body.classList.add(`${prefix}-${value}`);
}

function renderSettings() {
  document.body.classList.toggle('light', Boolean(state.lightTheme));
  applyClassGroup('layout', ['grid', 'list', 'compact'], state.layout);
  applyClassGroup('clock-style', ['both', 'digital', 'analog'], state.clockStyle);
  applyClassGroup('clock-size', ['normal', 'large'], state.clockSize);
  applyClassGroup('font', ['system', 'mono', 'serif'], state.font);
  document.documentElement.style.setProperty('--accent', state.accent || '#53d8fb');

  const hourToggle = document.getElementById('hour-format-toggle');
  const themeToggle = document.getElementById('theme-toggle');
  const layoutSelect = document.getElementById('layout-select');
  const styleSelect = document.getElementById('clock-style-select');
  const sizeSelect = document.getElementById('clock-size-select');
  const fontSelect = document.getElementById('font-select');
  const accentInput = document.getElementById('accent-color');
  const autoUpdateToggle = document.getElementById('auto-update-toggle');

  hourToggle.checked = state.hour12;
  themeToggle.checked = state.lightTheme;
  layoutSelect.value = state.layout;
  styleSelect.value = state.clockStyle;
  sizeSelect.value = state.clockSize;
  fontSelect.value = state.font;
  accentInput.value = state.accent;
  autoUpdateToggle.checked = state.autoUpdate;
}

function createClockCardElement(iana) {
  const zone = safeCatalogItem(iana);
  const article = document.createElement('article');
  article.className = 'clock-card';
  article.dataset.iana = iana;

  const titleRow = document.createElement('div');
  titleRow.className = 'clock-title-row';

  const titleGroup = document.createElement('div');
  const title = document.createElement('h3');
  title.className = 'clock-title';
  title.textContent = `${zone.city}, ${zone.country}`;
  const meta = document.createElement('p');
  meta.className = 'clock-meta';
  meta.textContent = `${zone.region} • ${iana}`;
  titleGroup.append(title, meta);

  const actions = document.createElement('div');
  actions.className = 'clock-actions';
  const pinButton = document.createElement('button');
  pinButton.type = 'button';
  pinButton.className = 'card-action';
  pinButton.dataset.action = 'pin';
  pinButton.setAttribute('aria-label', `Pin timezone ${zone.city}`);
  pinButton.textContent = state.favorites.includes(iana) ? '★' : '☆';
  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'card-action';
  removeButton.dataset.action = 'remove';
  removeButton.setAttribute('aria-label', `Remove timezone ${zone.city}`);
  removeButton.textContent = '✕';
  actions.append(pinButton, removeButton);

  titleRow.append(titleGroup, actions);

  const analogClock = document.createElement('div');
  analogClock.className = 'analog-clock';
  analogClock.setAttribute('aria-hidden', 'true');
  ['hour', 'minute', 'second'].forEach((hand) => {
    const handEl = document.createElement('span');
    handEl.className = `hand hand-${hand}`;
    analogClock.append(handEl);
  });
  const centerDot = document.createElement('span');
  centerDot.className = 'center-dot';
  analogClock.append(centerDot);

  const digitalTime = document.createElement('div');
  digitalTime.className = 'digital-time';
  digitalTime.textContent = '--:--:--';
  const date = document.createElement('div');
  date.className = 'clock-date';
  date.textContent = '---';
  const offset = document.createElement('div');
  offset.className = 'clock-detail offset';
  offset.textContent = 'Offset: --';
  const diff = document.createElement('div');
  diff.className = 'clock-detail diff';
  diff.textContent = 'Local difference: --';
  const sun = document.createElement('div');
  sun.className = 'clock-detail sun';
  sun.textContent = `Sunrise/Sunset: ${zone.sunrise}/${zone.sunset}`;

  article.append(titleRow, analogClock, digitalTime, date, offset, diff, sun);
  return article;
}

function updateClockCard(el, now) {
  const iana = el.dataset.iana;
  const refs = el._clockRefs || {
    digitalTime: el.querySelector('.digital-time'),
    clockDate: el.querySelector('.clock-date'),
    offset: el.querySelector('.offset'),
    diff: el.querySelector('.diff'),
    hourHand: el.querySelector('.hand-hour'),
    minuteHand: el.querySelector('.hand-minute'),
    secondHand: el.querySelector('.hand-second'),
  };
  el._clockRefs = refs;
  const time = getTimeForZone(iana, now, state.hour12);
  const date = getDateForZone(iana, now);
  const offset = formatOffset(getOffsetMinutes(iana, now));
  const diff = computeDifferenceHours(USER_TIMEZONE, iana, now);
  const parts = getPartsForZone(iana, now);

  refs.digitalTime.textContent = time;
  refs.clockDate.textContent = date;
  refs.offset.textContent = `Offset: ${offset}`;
  refs.diff.textContent = `Local difference: ${diff >= 0 ? '+' : ''}${diff.toFixed(1)}h`;

  const hourDeg = ((parts.hour % 12) + parts.minute / 60) * 30;
  const minuteDeg = (parts.minute + parts.second / 60) * 6;
  const secondDeg = parts.second * 6;

  refs.hourHand.style.transform = `translateX(-50%) rotate(${hourDeg}deg)`;
  refs.minuteHand.style.transform = `translateX(-50%) rotate(${minuteDeg}deg)`;
  refs.secondHand.style.transform = `translateX(-50%) rotate(${secondDeg}deg)`;
}

function updateClocks(force = false) {
  if (!state.autoUpdate && !force) {
    return;
  }

  const now = new Date();
  document.querySelectorAll('.clock-card').forEach((card) => updateClockCard(card, now));
  renderConverterResults();
}

function renderClockBoard() {
  const container = document.getElementById('clocks-container');
  const cards = sortedZones().map((iana) => createClockCardElement(iana));
  container.replaceChildren(...cards);

  cards.forEach((card) => {
    const iana = card.dataset.iana;
    card.querySelector('[data-action="remove"]').addEventListener('click', () => removeTimezone(iana));
    card.querySelector('[data-action="pin"]').addEventListener('click', () => toggleFavorite(iana));
  });

  updateClocks(true);
}

function renderChips(containerId, zones, clickHandler) {
  const container = document.getElementById(containerId);
  const buttons = zones.map((zone) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.dataset.iana = zone.iana || zone;
    button.textContent = zone.city || safeCatalogItem(zone).city;
    return button;
  });

  container.replaceChildren(...buttons);
  buttons.forEach((button) => {
    button.addEventListener('click', () => clickHandler(button.dataset.iana));
  });
}

function renderSearchResults(query) {
  const results = searchTimezones(query);
  renderChips('search-results', results, addTimezone);
}

function renderRecent() {
  renderChips('recent-timezones', state.recent.map(safeCatalogItem), addTimezone);
}

function renderPopular() {
  renderChips('popular-timezones', TIMEZONE_CATALOG.filter((zone) => zone.popular), addTimezone);
}

function renderConverterSelectors() {
  const source = document.getElementById('converter-source');
  const options = sortedZones().map((iana) => {
    const option = document.createElement('option');
    option.value = iana;
    option.textContent = `${safeCatalogItem(iana).city} (${iana})`;
    return option;
  });
  source.replaceChildren(...options);
}

function parseDateInput(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return { year, month, day };
}

function formatDateInput(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Converts a local wall-clock date/time in a source timezone into UTC.
 * Assumes dateInput is YYYY-MM-DD and timeInput is HH:mm (24-hour).
 * It iteratively derives offset via Intl for the source timezone and subtracts it.
 */
function zonedTimeToUtc(dateInput, timeInput, sourceIana) {
  const { year, month, day } = parseDateInput(dateInput);
  const [hour, minute] = timeInput.split(':').map(Number);
  const wallClockUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guessUtc = wallClockUtc;
  for (let iteration = 0; iteration < MAX_OFFSET_ITERATIONS; iteration += 1) {
    const offset = getOffsetMinutes(sourceIana, new Date(guessUtc));
    const nextGuess = wallClockUtc - offset * MILLIS_PER_MINUTE;
    if (nextGuess === guessUtc) {
      break;
    }
    guessUtc = nextGuess;
  }
  return new Date(guessUtc);
}

function renderConverterResults() {
  const source = document.getElementById('converter-source').value;
  const timeValue = document.getElementById('converter-time').value;
  const dateValue = document.getElementById('converter-date').value;
  const resultContainer = document.getElementById('converter-results');

  if (!source || !timeValue || !dateValue) {
    resultContainer.replaceChildren();
    return;
  }

  const utcDate = zonedTimeToUtc(dateValue, timeValue, source);
  const items = sortedZones().map((iana) => {
    const converted = getTimeForZone(iana, utcDate, state.hour12);
    const diff = computeDifferenceHours(source, iana, utcDate);
    const item = document.createElement('div');
    item.className = 'result-item';
    const city = document.createElement('strong');
    city.textContent = safeCatalogItem(iana).city;
    const detail = document.createElement('span');
    detail.className = 'clock-detail';
    detail.textContent = ` (${diff >= 0 ? '+' : ''}${diff.toFixed(1)}h)`;
    item.append(city, `: ${converted}`, detail);
    return item;
  });
  resultContainer.replaceChildren(...items);
}

function renderMeetingResults() {
  const startHour = Number(document.getElementById('work-start').value);
  const endHour = Number(document.getElementById('work-end').value);
  const durationMinutes = Number(document.getElementById('meeting-duration').value);
  const results = calculateMeetingSlots(sortedZones(), { startHour, endHour, durationMinutes });

  const list = document.getElementById('meeting-results');
  if (!results.length) {
    const item = document.createElement('li');
    item.className = 'result-item status-bad';
    item.textContent = 'No overlapping slots found for current constraints.';
    list.replaceChildren(item);
    return;
  }

  const items = results.map((slot) => {
    const localLabel = getFormatter(USER_TIMEZONE, {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(slot.date);
    const matches = slot.matches.map((iana) => safeCatalogItem(iana).city).join(', ');
    const item = document.createElement('li');
    item.className = 'result-item';
    const score = document.createElement('strong');
    score.className = 'status-good';
    score.textContent = `Available in ${slot.matchCount}/${state.zones.length} zones`;
    const details = document.createElement('span');
    details.className = 'clock-detail';
    details.textContent = matches;
    item.append(score, ` • ${localLabel}`, document.createElement('br'), details);
    return item;
  });
  list.replaceChildren(...items);
}

function bindEvents() {
  const searchInput = document.getElementById('timezone-search');
  const addButton = document.getElementById('add-timezone-btn');

  searchInput.addEventListener('input', (event) => {
    renderSearchResults(event.target.value);
  });

  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      const found = searchTimezones(searchInput.value)[0];
      if (found) {
        addTimezone(found.iana);
        searchInput.value = '';
        renderSearchResults('');
      }
    }
  });

  addButton.addEventListener('click', () => {
    const found = searchTimezones(searchInput.value)[0];
    if (found) {
      addTimezone(found.iana);
      searchInput.value = '';
      renderSearchResults('');
    }
  });

  document.getElementById('hour-format-toggle').addEventListener('change', (event) => {
    state.hour12 = event.target.checked;
    updateClocks(true);
    saveState();
  });

  document.getElementById('theme-toggle').addEventListener('change', (event) => {
    state.lightTheme = event.target.checked;
    renderSettings();
    saveState();
  });

  document.getElementById('layout-select').addEventListener('change', (event) => {
    state.layout = event.target.value;
    renderSettings();
    saveState();
  });

  document.getElementById('clock-style-select').addEventListener('change', (event) => {
    state.clockStyle = event.target.value;
    renderSettings();
    saveState();
  });

  document.getElementById('clock-size-select').addEventListener('change', (event) => {
    state.clockSize = event.target.value;
    renderSettings();
    saveState();
  });

  document.getElementById('font-select').addEventListener('change', (event) => {
    state.font = event.target.value;
    renderSettings();
    saveState();
  });

  document.getElementById('accent-color').addEventListener('change', (event) => {
    state.accent = event.target.value;
    renderSettings();
    saveState();
  });

  document.getElementById('auto-update-toggle').addEventListener('change', (event) => {
    state.autoUpdate = event.target.checked;
    if (state.autoUpdate) {
      updateClocks(true);
    }
    saveState();
  });

  ['converter-source', 'converter-time', 'converter-date'].forEach((id) => {
    document.getElementById(id).addEventListener('change', renderConverterResults);
  });

  document.getElementById('find-meeting-btn').addEventListener('click', renderMeetingResults);
}

function renderAll() {
  renderSettings();
  renderClockBoard();
  renderPopular();
  renderRecent();
  renderConverterSelectors();
  renderConverterResults();
  renderMeetingResults();
}

function initialize() {
  loadState();
  const today = new Date();
  document.getElementById('converter-date').value = formatDateInput(today);
  bindEvents();
  renderAll();
  updateClocks(true);
  setInterval(() => {
    updateClocks();
  }, 1000);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getTimeForZone,
    getOffsetMinutes,
    formatOffset,
    computeDifferenceHours,
    calculateMeetingSlots,
    searchTimezones,
    zonedTimeToUtc,
  };
}
