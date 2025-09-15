# iTaxi-Finder Platform Skeleton

This repository contains a minimal Node/Express server that follows the
[iTaxi-Finder SRS](./SRS.md) and exposes placeholder endpoints for the
future MEAN stack implementation.

## Getting Started

### Requirements
- Node.js 20+
- npm

### Installation
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the project root with your Google Maps key:
   ```bash
   GOOGLE_MAPS_API_KEY=AIzaSyCYxFkL9vcvbaFz-Ut1Lm2Vge5byodujfk
   ```
4. Start the development server:
   ```bash
   npm start
   ```
5. The server runs on `http://localhost:3000`.

### Available Endpoints
- `GET /config` – exposes `GOOGLE_MAPS_API_KEY`.
- `GET /api/routes` – list routes (placeholder).
- `POST /api/routes` – create route (placeholder).
- `PUT /api/routes/:id` – update route (placeholder).
- `POST /api/roads/snap` – proxy to Roads API (placeholder).
- `POST /api/tripchain/suggest` – suggests trip chain (placeholder).
- `POST /api/orders` – create order (placeholder).
- `GET /api/orders/:id` – retrieve order (placeholder).
- `POST /api/orders/:id/scan` – register QR scan (placeholder).

These routes align with the SRS and can be expanded into a full MEAN
application.
