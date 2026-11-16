# QALA — city super-app for Astana

QALA is an open-source city services app for Astana, Kazakhstan. It brings the everyday things a resident needs — the map, air quality, government services, reminders, nearby places and safety tools — into one app that works on the web, on Android and on Windows.

The interface is in Russian and Kazakh (with partial English).

| Car mode (phone) | Car mode (desktop) | Menu settings |
|---|---|---|
| ![Car mode on a phone](docs/screenshots/1-v-mashine-telefon.png) | ![Car mode on desktop](docs/screenshots/2-v-mashine-pk.png) | ![Show or hide sections](docs/screenshots/3-razdely-galochki-telefon.png) |

## Features

**City**
- **Map of Astana** with layers, routes, parkings and bus stops
- **Air quality** by district (Esil, Almaty, Saryarka, Baikonyr, Nura): US AQI, PM2.5, PM10, NO₂, O₃, SO₂, CO, 24-hour forecast and health advice
- **Traffic and weather**, including frost alerts for schools and drivers
- **Nearby places** from OpenStreetMap: pharmacies, EV chargers, warm places (malls and libraries), coworkings, ice rinks and sports, parks, vet clinics, accessible places
- **City guide** with 1-day and 3-day routes and an audio guide, plus checklists for people who just moved and for renting an apartment

**Services and documents**
- **Government services guide**: 27 popular services in 7 groups (documents, certificates, family, car, property, work, health) — what you need and where to apply (egov.kz, eGov Mobile or a service centre)
- **Insurance**: 8 types explained (including mandatory car insurance), your policies with expiry reminders, a request text generator

**Home and money**
- **My home**: car documents and maintenance, parking timer, utility meter readings with history, home medicine cabinet with expiry dates, pet passport, doctor appointments, class timetable, shopping list and weekly menu
- **Money**: recurring payments with reminders, bill splitting, savings goals, mortgage and rent calculators

**Community**
- **City together** board: complaints to the city administration (photo, location, ready-to-send text), carpooling, icy roads, lost and found, lost pets, neighbours, volunteering, group runs, reviews of residential complexes, small jobs

**Safety**
- **SOS** button that opens an SMS to family with your location, an "I'm home" message, emergency numbers

**Driving**
- **Car mode** with large buttons: navigation, traffic, EV chargers, parking timer, radio, SOS
- **Android Auto** radio (media app) with an editable list of stations

**Everyday**
- **Today feed** on the home screen with smart hints (bad air, frost, policies and payments due, parking time left)
- **Android widgets**: "Today" (weather, AQI, top reminders) and "Quick actions" (map, taxi, parking, SOS)
- **Morning summary** notification, quiet hours
- **Settings**: hide any section with a checkbox, lite mode for slow phones (no blur or animations), large font, scheduled dark theme, simple mode with six big buttons for elderly users, read-screen-aloud, backup and restore, demo data
- **Points and achievements** for useful actions, and a "green month" counter of car-free trips

There are also modules for food delivery, taxi, apartments (Qala Үй), a marketplace, Qala TV, cinema listings, music, sport and an AI assistant.

## Platforms

| Platform | How it's built |
|---|---|
| Web | Vite + React, served by the Express server |
| Android | WebView shell; the UI is bundled inside the APK, data comes from `/api` |
| Windows | Electron; installer and portable `.exe` built with electron-builder |

## Tech stack

- **Frontend:** React 19, TypeScript, Tailwind CSS 4, Vite, Leaflet, lucide-react
- **Backend:** Node.js, Express, SQLite (`node:sqlite`), Google Gemini API for the AI assistant
- **Desktop:** Electron
- **Android:** Java (WebView, AppWidgetProvider, MediaBrowserService for Android Auto)

Most personal data (policies, payments, medicine, timetable, settings) is stored **only on the device** in local storage. The server stores the shared community board, TV channels and admin settings.

## Getting started

Requirements: Node.js 22 or newer.

```bash
git clone https://github.com/YOUR-USERNAME/qala.git
cd qala
npm install
cp .env.example .env      # add GEMINI_API_KEY; TOMTOM_API_KEY is optional
npm run dev               # http://localhost:3000
```

### Build

```bash
npm run build             # web build into dist/
npm start                 # production server
npm run build:exe         # Windows installer and portable exe into release-exe/
```

The Android shell sources are in `android-native/`.

### Admin panel

The admin panel is protected by a PIN. The default PIN is `1234`; protected actions stay blocked until you change it in the admin panel.

## Project structure

```
src/
  App.tsx               main layout, navigation, sections
  components/           one file per section (QalaAirModule, QalaGovModule, QalaLifeModule, ...)
  lib/                  network and offline cache, local storage, section settings
server.ts               Express API and SQLite database
electron/               Windows desktop shell
android-native/         Android shell, widgets and Android Auto service
public/                 icons and static files
```

## Data sources

- Map data and nearby places © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL)
- Air quality: [Open-Meteo Air Quality API](https://open-meteo.com/) (CC BY 4.0)
- Government services: summaries written for this project. Always check current requirements, fees and deadlines on [egov.kz](https://egov.kz).

## Roadmap

- Full Kazakh translation of every screen
- Automated tests and CI
- Easier self-hosting for other cities
- Push notifications
- Google Play release

## Contributing

Issues and pull requests are welcome. Please describe what you changed and how you tested it. Translations into Kazakh are especially helpful.

## License

[MIT](LICENSE) © 2026 Amir Koshkarbayev

## Author

Amir Koshkarbayev — student of Information Systems and Technologies at Astana International University.
