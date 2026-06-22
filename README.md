# 🌍 World Clock

A production-ready world clock web app with real-time multi-timezone tracking, conversion, scheduling, customization, and GitHub Pages deployment.

## ✨ Features

### Core functionality
- Add/remove up to 12 time zones dynamically
- Real-time updates every second
- Search time zones by city/region/country/IANA
- Pin favorite zones to keep them sorted first
- Persistent preferences via `localStorage`

### UI and customization
- Responsive design for desktop/mobile
- Analog + digital clocks (switchable)
- 12/24-hour toggle
- Dark/light theme toggle
- Grid/list/compact layout modes
- Accent color, font, and clock size controls
- Auto-update toggle

### Advanced tools
- Time zone converter with offset difference display
- Local time comparison against each zone
- Meeting scheduler (best overlap in next 24h)
- Sunrise/sunset reference per configured city
- Popular and recent timezone quick-access chips

### Accessibility and quality
- Semantic landmarks and ARIA labels
- Keyboard-accessible controls/buttons
- Contrast-conscious theme tokens
- Node test suite for timezone and scheduler utilities

## 🚀 Run locally

No build step is required.

1. Clone the repository
2. Open `index.html` in a modern browser

```bash
git clone REPOSITORY_URL
cd world-clock
xdg-open index.html
```

## 🧪 Testing

Run the automated tests with Node.js:

```bash
node --test
```

## 📦 Deployment & CI/CD

- **CI workflow** (`.github/workflows/ci.yml`) runs `node --test` on pushes and pull requests.
- **GitHub Pages workflow** (`.github/workflows/deploy-pages.yml`) deploys from `main`.

To enable Pages in GitHub:
1. Repository **Settings → Pages**
2. Set source to **GitHub Actions**
3. Push to `main`

## 🧭 Architecture

- `index.html`: app layout and accessible controls
- `style.css`: responsive styling, themes, animations
- `script.js`: timezone calculations, rendering, persistence, scheduler, converter
- `tests/script.test.js`: utility-level tests

## 🛠 Troubleshooting

- If times look stale, ensure **Auto-update clocks** is enabled.
- If no meeting slots appear, widen workday hours or reduce duration.
- If deployment does not run, verify GitHub Pages is configured for Actions.

## License

MIT — see [LICENSE](LICENSE).
