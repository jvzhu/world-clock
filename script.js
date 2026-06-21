/**
 * World Clock — script.js
 * Updates time displays for UTC, ET, PT, and JST every second
 * using the Intl.DateTimeFormat API with IANA timezone identifiers.
 */

const TIMEZONES = [
  { id: 'utc', iana: 'UTC' },
  { id: 'et', iana: 'America/New_York' },
  { id: 'pt', iana: 'America/Los_Angeles' },
  { id: 'jst', iana: 'Asia/Tokyo' },
];

/**
 * Returns the current time string (HH:MM:SS) for a given IANA timezone.
 * @param {string} iana - IANA timezone identifier (e.g. 'America/New_York')
 * @param {Date} date - Date instance to format
 * @returns {string}
 */
function getTimeForZone(iana, date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: iana,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * Updates all clock displays.
 */
function updateClocks() {
  const now = new Date();

  TIMEZONES.forEach(({ id, iana }) => {
    const el = document.getElementById(`time-${id}`);
    if (el) {
      el.textContent = getTimeForZone(iana, now);
    }
  });
}

// Initial update and then every second
updateClocks();
setInterval(updateClocks, 1000);
