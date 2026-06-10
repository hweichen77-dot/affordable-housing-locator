# Affordable Housing Locator

> A free, open-source desktop app that helps anyone in the United States find affordable housing — by city, ZIP code, or current location.

Built for the **Congressional App Challenge**.

---

## The Problem

Over **40 million Americans** pay more than they can afford for rent. Median rents have risen 30%+ since 2020. Finding eligible affordable housing programs is confusing, fragmented, and inaccessible to the people who need it most.

This app changes that.

---

## Features

- **Nationwide coverage** — search any city or ZIP across all 50 states using the HUD LIHTC database (50,000+ properties)
- **Enhanced local data** — supplemental housing inventory from city/county open data portals (currently includes San Jose GeoHub)
- **Income eligibility calculator** — enter your household income and size to see which programs you qualify for based on HUD Area Median Income (AMI) limits
- **Accurate rent estimates** — HUD-regulated maximum rents per bedroom type and AMI tier
- **My Applications tracker** — mark properties as Interested, Applied, or Waitlisted; persists across sessions
- **Application guide** — checklist of typical documents needed and what to expect from the process
- **Near me** — one-tap search using your current location
- **Filters** — by income tier (ELI/VLI/LI/Moderate), bedroom size, household type, rental assistance
- **Sort** — by name, unit count, distance, or lowest rent
- **Favorites + export** — save properties and export to a text file
- **Affordability expiry alerts** — warns when a property's affordability restriction is expiring
- **External listings links** — direct links to Affordable Housing Online and Socialserve for current availability

---

## Data Sources

| Source | Coverage | Updated |
|--------|----------|---------|
| [City of San Jose GeoHub](https://geo.sanjoseca.gov) | San Jose, CA | Regularly |
| [HUD National LIHTC Database](https://www.huduser.gov/portal/datasets/lihtc.html) | All 50 states | 2024 |
| [HUD FY2024 Area Median Income](https://www.huduser.gov/portal/datasets/il.html) | All metros | 2024 |
| [OpenStreetMap / Nominatim](https://nominatim.openstreetmap.org) | Geocoding | Real-time |

---

## Technical Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Rust (Tauri v2) — handles API fetching, geocoding, and data pagination
- **Map**: MapLibre GL JS
- **Desktop**: Tauri — native macOS app (Windows/Linux supported)

---

## How AMI and Rent Work

The **Area Median Income (AMI)** is the midpoint household income for a metro area, set annually by HUD. Affordable housing programs cap rents at **30% of the income limit** for each tier:

| Tier | Income Limit | Who qualifies |
|------|-------------|---------------|
| ELI (Extremely Low) | ≤30% AMI | Lowest-income households |
| VLI (Very Low) | ≤50% AMI | Very low income |
| LI (Low) | ≤80% AMI | Low income |
| Moderate | ≤120% AMI | Moderate income |

These rents are HUD-regulated maximums by federal law for LIHTC properties.

---

## Building from Source

```bash
# Prerequisites: Node.js 18+, Rust 1.75+
npm install
npm run tauri dev      # development
npm run tauri build    # production
```

---

## Privacy

All data is fetched directly from public government APIs at search time. Nothing is sent to any third-party server. Application statuses and favorites are stored locally on your device only.

---

## License

MIT
