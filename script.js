/**
 * World Clock — script.js
 * Updates time displays for UTC, EST, PST, and JST every second
 * using the Intl.DateTimeFormat API with IANA timezone identifiers.
 */

const TIMEZONES = [
  { id: 'utc', iana: 'UTC' },
  { id: 'est', iana: 'America/New_York' },
  { id: 'pst', iana: 'America/Los_Angeles' },
  { id: 'jst', iana: 'Asia/Tokyo' },
];

/**
 * Returns the current time string (HH:MM:SS) for a given IANA timezone.
 * @param {string} iana - IANA timezone identifier (e.g. 'America/New_York')
 * @returns {string}
 */
function getTimeForZone(iana) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: iana,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date());
}

/**
 * Updates all clock displays.
 */
function updateClocks() {
  TIMEZONES.forEach(({ id, iana }) => {
    const el = document.getElementById(`time-${id}`);
    if (el) {
      el.textContent = getTimeForZone(iana);
    }
  });
}

// Initial update and then every second
updateClocks();
setInterval(updateClocks, 1000);
