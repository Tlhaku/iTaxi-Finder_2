# BasaGas Platform

This repository contains the BasaGas small-cylinder LPG refill and delivery platform. It fulfils the Codex SRS requirements with a MEAN stack implementation featuring a MongoDB-backed Express API, an Angular front-end, and real-time deliverer tracking via Socket.IO.

## Prerequisites

- Node.js 18 or later
- npm 9 or later
- MongoDB instance (local or cloud such as MongoDB Atlas)

## Environment configuration

Create a `server/.env` file with the following keys (example values shown):

```
PORT=4000
MONGO_URI=mongodb://127.0.0.1:27017/basagas
JWT_SECRET=super-secret-change-me
CLIENT_ORIGIN=http://localhost:4200
GOOGLE_MAPS_API_KEY=AIzaSyCYxFkL9vcvbaFz-Ut1Lm2Vge5byodujfk
YOCO_PUBLIC_KEY=pk_test_placeholder
```

- `CLIENT_ORIGIN` accepts a comma-separated list when you deploy multiple front-end origins.
- Replace the placeholder secrets with production-ready values before deploying.

## Installing dependencies

Install server dependencies:

```
cd server
npm install
```

Install Angular client dependencies:

```
cd ../client
npm install
```

## Running the platform locally

1. Start MongoDB (for example `mongod --dbpath <path>` if you host it locally).
2. Start the API server:
   ```
   cd server
   npm run start
   ```
   The Express server listens on `http://localhost:4000` by default, exposes REST endpoints, and hosts the Socket.IO gateway for live deliverer tracking.
3. In a separate terminal start the Angular development server:
   ```
   cd client
   npm run start
   ```
   This runs `ng serve` and serves the web app at `http://localhost:4200` with live reload.

### Building the Angular client for production

```
cd client
npm run build
```

The build output is written to `client/dist/basagas-client/` and can be hosted from a CDN or reverse-proxied behind the API server.

## Testing

No automated tests ship with this MVP. You can lint or unit-test the Angular app with `npm run test` from the `client` folder once you have Chrome installed locally. The server exposes a placeholder `npm test` script.

## Key features implemented

- Role-based authentication (customer & deliverer) with bcrypt-secured credentials and JWT sessions.
- Order capture for 2 kg – 7 kg cylinders, with pickup/drop-off details and Yoco token storage placeholder.
- Angular front-end with responsive navigation, pricing, visitor comments placeholder, and Google Maps powered tracking.
- Deliverer live location broadcasting via WebSockets with automatic expiry after two minutes of inactivity.
- CSRF protection via double-submit cookies, secure configuration endpoints, and environment-driven API keys.

Consult the SRS for planned enhancements such as payment capture, SMS notifications, and analytics dashboards.
