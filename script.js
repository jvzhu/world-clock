const STORAGE_KEY = 'world-clock-state-v2';

const TIMEZONE_CATALOG = [
  { iana: 'UTC', city: 'UTC', region: 'Global', country: 'International', sunrise: '06:00', sunset: '18:00', popular: true },
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

  const map = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return {
    hour: Number(map.hour || 0),
    minute: Number(map.minute || 0),
    second: Number(map.second || 0),
  };
}

function getOffsetMinutes(iana, date = new Date()) {
  const label = getFormatter(iana, { timeZoneName: 'shortOffset' })
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')?.value;

  if (!label || label === 'GMT') {
    return 0;
  }

  const match = label.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
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
    const candidate = new Date(start.getTime() + mins * 60_000);
    const matches = zones.filter((iana) => {
      const parts = getPartsForZone(iana, candidate);
      const localMinutes = parts.hour * 60 + parts.minute;
      return isWithinWindow(localMinutes, startHour, endHour, durationMinutes);
    });

    if (matches.length) {
      candidates.push({
        date: candidate,
        score: matches.length,
        matches,
      });
    }
  }

  return candidates
    .sort((a, b) => (b.score - a.score) || (a.date - b.date))
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
    Object.assign(state, parsed);
  } catch (_) {
    // ignore malformed state
  }

  state.zones = state.zones.filter((zone) => safeCatalogItem(zone)).slice(0, 12);
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
  state.recent = [iana, ...state.recent.filter((item) => item !== iana)].slice(0, 6);
}

function addTimezone(iana) {
  if (!state.zones.includes(iana) && state.zones.length < 12) {
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

function cardTemplate(iana) {
  const zone = safeCatalogItem(iana);
  return `
    <article class="clock-card" data-iana="${iana}">
      <div class="clock-title-row">
        <div>
          <h3 class="clock-title">${zone.city}, ${zone.country}</h3>
          <p class="clock-meta">${zone.region} • ${iana}</p>
        </div>
        <div class="clock-actions">
          <button type="button" class="card-action" data-action="pin" aria-label="Pin timezone ${zone.city}">${state.favorites.includes(iana) ? '★' : '☆'}</button>
          <button type="button" class="card-action" data-action="remove" aria-label="Remove timezone ${zone.city}">✕</button>
        </div>
      </div>
      <div class="analog-clock" aria-hidden="true">
        <span class="hand hand-hour"></span>
        <span class="hand hand-minute"></span>
        <span class="hand hand-second"></span>
        <span class="center-dot"></span>
      </div>
      <div class="digital-time">--:--:--</div>
      <div class="clock-date">---</div>
      <div class="clock-detail offset">Offset: --</div>
      <div class="clock-detail diff">Local difference: --</div>
      <div class="clock-detail sun">Sunrise/Sunset: ${zone.sunrise}/${zone.sunset}</div>
    </article>
  `;
}

function updateClockCard(el, now) {
  const iana = el.dataset.iana;
  const time = getTimeForZone(iana, now, state.hour12);
  const date = getDateForZone(iana, now);
  const offset = formatOffset(getOffsetMinutes(iana, now));
  const diff = computeDifferenceHours(Intl.DateTimeFormat().resolvedOptions().timeZone, iana, now);
  const parts = getPartsForZone(iana, now);

  el.querySelector('.digital-time').textContent = time;
  el.querySelector('.clock-date').textContent = date;
  el.querySelector('.offset').textContent = `Offset: ${offset}`;
  el.querySelector('.diff').textContent = `Local difference: ${diff >= 0 ? '+' : ''}${diff.toFixed(1)}h`;

  const hourDeg = ((parts.hour % 12) + parts.minute / 60) * 30;
  const minuteDeg = (parts.minute + parts.second / 60) * 6;
  const secondDeg = parts.second * 6;

  el.querySelector('.hand-hour').style.transform = `translateX(-50%) rotate(${hourDeg}deg)`;
  el.querySelector('.hand-minute').style.transform = `translateX(-50%) rotate(${minuteDeg}deg)`;
  el.querySelector('.hand-second').style.transform = `translateX(-50%) rotate(${secondDeg}deg)`;
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
  container.innerHTML = sortedZones().map((iana) => cardTemplate(iana)).join('');

  container.querySelectorAll('.clock-card').forEach((card) => {
    const iana = card.dataset.iana;
    card.querySelector('[data-action="remove"]').addEventListener('click', () => removeTimezone(iana));
    card.querySelector('[data-action="pin"]').addEventListener('click', () => toggleFavorite(iana));
  });

  updateClocks(true);
}

function renderChips(containerId, zones, clickHandler) {
  const container = document.getElementById(containerId);
  container.innerHTML = zones
    .map((zone) => `<button type="button" class="chip" data-iana="${zone.iana || zone}">${zone.city || safeCatalogItem(zone).city}</button>`)
    .join('');

  container.querySelectorAll('.chip').forEach((button) => {
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
  source.innerHTML = sortedZones()
    .map((iana) => `<option value="${iana}">${safeCatalogItem(iana).city} (${iana})</option>`)
    .join('');
}

function parseDateInput(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return { year, month, day };
}

function zonedTimeToUtc(dateInput, timeInput, sourceIana) {
  const { year, month, day } = parseDateInput(dateInput);
  const [hour, minute] = timeInput.split(':').map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offset = getOffsetMinutes(sourceIana, guess);
  return new Date(guess.getTime() - offset * 60_000);
}

function renderConverterResults() {
  const source = document.getElementById('converter-source').value;
  const timeValue = document.getElementById('converter-time').value;
  const dateValue = document.getElementById('converter-date').value;
  const resultContainer = document.getElementById('converter-results');

  if (!source || !timeValue || !dateValue) {
    resultContainer.innerHTML = '';
    return;
  }

  const utcDate = zonedTimeToUtc(dateValue, timeValue, source);
  resultContainer.innerHTML = sortedZones()
    .map((iana) => {
      const converted = getTimeForZone(iana, utcDate, state.hour12);
      const diff = computeDifferenceHours(source, iana, utcDate);
      return `<div class="result-item"><strong>${safeCatalogItem(iana).city}</strong>: ${converted} <span class="clock-detail">(${diff >= 0 ? '+' : ''}${diff.toFixed(1)}h)</span></div>`;
    })
    .join('');
}

function renderMeetingResults() {
  const startHour = Number(document.getElementById('work-start').value);
  const endHour = Number(document.getElementById('work-end').value);
  const durationMinutes = Number(document.getElementById('meeting-duration').value);
  const results = calculateMeetingSlots(sortedZones(), { startHour, endHour, durationMinutes });

  const list = document.getElementById('meeting-results');
  if (!results.length) {
    list.innerHTML = '<li class="result-item status-bad">No overlapping slots found for current constraints.</li>';
    return;
  }

  list.innerHTML = results
    .map((slot) => {
      const localLabel = getFormatter(Intl.DateTimeFormat().resolvedOptions().timeZone, {
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(slot.date);
      const matches = slot.matches.map((iana) => safeCatalogItem(iana).city).join(', ');
      return `<li class="result-item"><strong class="status-good">${slot.score}/${state.zones.length} zones</strong> • ${localLabel}<br><span class="clock-detail">${matches}</span></li>`;
    })
    .join('');
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
  document.getElementById('converter-date').value = today.toISOString().slice(0, 10);
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
