# 🌍 World Clock

A simple, responsive digital clock application that displays the current time in four major time zones, updated every second.

## Features

- Real-time clock updates every second
- Displays time in **HH:MM:SS** (24-hour) format
- Four time zones shown simultaneously:
  | Label | Full Name                   | IANA Timezone        |
  |-------|-----------------------------|----------------------|
  | UTC   | Coordinated Universal Time  | UTC                  |
  | ET    | Eastern Time (New York)     | America/New_York     |
  | PT    | Pacific Time (Los Angeles)  | America/Los_Angeles  |
  | JST   | Japan Standard Time         | Asia/Tokyo           |
- Responsive grid layout — works on desktop, tablet, and mobile
- Dark-themed, glassmorphism-style UI

## Project Structure

```
world-clock/
├── index.html   # Main HTML page with clock cards
├── style.css    # Responsive styles
├── script.js    # Clock logic (real-time updates)
└── README.md    # This file
```

## Usage

No build step or dependencies required — it is plain HTML, CSS, and JavaScript.

1. Clone the repository:
   ```bash
   git clone https://github.com/jvzhu/world-clock.git
   cd world-clock
   ```

2. Open `index.html` in any modern web browser:
   ```bash
   # macOS
   open index.html

   # Linux
   xdg-open index.html

   # Windows
   start index.html
   ```

   Or simply drag the `index.html` file into your browser window.

## How It Works

`script.js` uses the `Intl.DateTimeFormat` API with IANA timezone identifiers to retrieve the current time in each timezone. Daylight Saving Time is handled automatically by the browser's internationalization engine. The DOM is updated every second via `setInterval`.

## License

This project is open source and available under the [MIT License](LICENSE).