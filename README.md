# iTaxi-Finder

A prototype MEAN-style platform for mapping and editing South African minibus-taxi routes.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [npm](https://www.npmjs.com/)
- (Optional) [MongoDB](https://www.mongodb.com/) if you plan to persist data

## Setup

### 1. Server

```bash
cd server
cp .env.example .env # set GOOGLE_MAPS_API_KEY and MONGODB_URI
npm install
npm start
```
The server exposes:
- `GET /config` – returns the Google Maps API key for the client
- `GET /api/routes` – sample routes data

### 2. Client

The client is a simple static front‑end that fetches the Maps key and loads Google Maps.

```bash
cd client
npm install # (no dependencies yet, but keeps npm happy)
npm test    # runs a placeholder test
```
Serve the files using any static web server, e.g.:

```bash
npx http-server .
```
Then open `http://localhost:8080/index.html` in your browser.

## Environment variables

- `GOOGLE_MAPS_API_KEY` – Google Maps key used by the client
- `MONGODB_URI` – connection string for MongoDB (not used in prototype)

## Project structure

```
server/  Express API server
client/  Static front-end with Google Maps
```

## Notes

This is an early scaffold based on the full SRS. It includes placeholders for routes, delivery, community, registration, and about pages, and a Hide UI toggle.
