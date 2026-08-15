# Family Vitals

A calm, dark, nocturnal health tracking application for families. Track blood pressure, pulse, and blood sugar readings with a minimal, high-contrast UI designed for nighttime use.

## Quick Links

- [Demo](#) | [Documentation](#) | [Issues](#)

## Features

- **Family Health Tracking**: Log and view BP, Pulse, and Blood Sugar readings
- **Family Management**: Create families, assign members, view family dashboards
- **Authentication**: Supabase Auth with registration control
- **PWA Support**: Installable on mobile devices
- **Python Maintenance**: Scripts for validation, export, and admin tasks

## Tech Stack

- **Frontend**: Vanilla JavaScript (modular ES modules), HTML, CSS
- **Backend**: Supabase (Auth, Postgres, RLS)
- **PWA**: manifest.json + Service Worker
- **Python**: Validation, export, and admin scripts

## Project Structure

```
family-vitals/
├── index.html          # Main HTML entry point
├── manifest.json       # PWA manifest
├── sw.js              # Service worker for caching
├── css/
│   └── style.css      # Design system with calm nocturnal theme
├── js/
│   ├── app.js         # Main application entry point
│   ├── auth.js        # Authentication flow
│   ├── supabaseClient.js  # Supabase client initialization
│   ├── services/
│   │   ├── uiService.js   # UI utility functions (alerts, etc.)
│   │   └── supabaseClient.js
│   ├── features/
│   │   ├── auth/          # Authentication screens
│   │   ├── dashboard/     # Personal dashboard
│   │   ├── family/        # Family view
│   │   ├── readings/      # Logging and history
│   │   └── admin/         # Admin panel (Super Admins)
│   └── shared/          # Shared utilities
├── assets/icons/        # PWA icons (192x192, 512x512)
├── python/
│   ├── export_readings.py   # Export readings to CSV
│   ├── validate_readings.py # Validate reading data
│   └── README.md          # This file
├── supabase/
│   └── migrations/        # Database migrations
├── design.md             # Design system documentation
└── README.md             # This overview
```

## Getting Started

### Prerequisites

1. **Supabase Project**: Create a project at https://supabase.com
2. **Node.js**: Optional, for development workflow

### Setup

1. Clone this repository
2. Update the Supabase credentials in `js/services/supabaseClient.js`
3. Run `npm install` or open the project in VS Code
4. Open `index.html` in your browser

### Development

```bash
# Open in browser
open index.html

# Or use VS Code Live Server
# Right-click index.html → "Open with Live Server"
```

### Python Scripts

```bash
# Validate readings
python python/validate_readings.py readings.json

# Export to CSV
python python/export_readings.py export.csv

# Check for orphaned readings
python python/export_readings.py check-orphaned

# Generate admin report
python python/export_readings.py admin-report.json

# Backfill missing context
python python/validate_readings.py backfill readings.json
```

## Design Philosophy

Family Vitals embraces a **calm nocturnal design** inspired by Alethia Earth:

- **Color palette**: Deep forest-black backgrounds (`#0F1F10`), white text, muted accents
- **Typography**: Geist for headings, Geist Mono for labels and metrics
- **Visual hierarchy**: Large metric values, sparse layout, minimal chrome
- **Contrast**: High contrast for readability in low-light conditions
- **Mobile-first**: Sparse, readable forms and navigation

## Color System

| Color | Hex | Usage |
|-------|-----|-------|
| Primary background | `#0F1F10` | Main page background |
| Surface | `#121A13` | Card backgrounds |
| Surface elevated | `#172016` | Input backgrounds |
| On surface | `#FFFFFF` | Primary text |
| On surface muted | `#FFFFFF99` | Secondary labels |
| Border | `#2A3A2C` | Card borders |
| Success | `#A7F3D0` | Normal readings |
| Warning | `#FDE68A` | Elevated readings |
| Danger | `#FECACA` | High readings |
| Primary | `#FFFFFF` | Buttons, links |

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to your fork
5. Submit a Pull Request

## License

MIT License - feel free to use and modify this project for personal or commercial purposes.