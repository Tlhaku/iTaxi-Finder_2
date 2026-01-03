# Kninz Knitwear storefront (MEAN stack)

This repository now powers **Kninz**, a cozy knitwear storefront for ponchos, scarves, and hats. It delivers a MEAN stack experience with an Angular front-end, an Express + MongoDB API, and payment placeholders for Yoco, PayGate, and iKhokha.

## Prerequisites
- Node.js 18 or later
- npm 9 or later
- MongoDB instance (local or cloud such as MongoDB Atlas)

## Environment configuration
Create `server/.env` with the following keys (example values shown):

```
PORT=4000
MONGO_URI=mongodb://127.0.0.1:27017/kninz-store
JWT_SECRET=super-secret-change-me
CLIENT_ORIGIN=http://localhost:4200
GOOGLE_MAPS_API_KEY=AIzaSyCYxFkL9vcvbaFz-Ut1Lm2Vge5byodujfk
YOCO_PUBLIC_KEY=pk_test_placeholder
```

- `CLIENT_ORIGIN` accepts a comma-separated list when you deploy multiple front-end origins.
- Replace placeholder secrets with production-ready values before deploying.

## Installing dependencies
From the project root install dependencies for both apps:

```bash
cd server
npm install
cd ../client
npm install
```

## Running locally (step-by-step)
1. Make sure MongoDB is running (for example `mongod --dbpath <path>` if you host it locally).
2. Start the API server:
   ```bash
   cd server
   npm run start
   ```
   The Express server listens on `http://localhost:4000` by default and exposes REST endpoints for auth, orders, configuration, and payment token placeholders.
3. In a separate terminal start the Angular development server:
   ```bash
   cd client
   npm run start
   ```
   This runs `ng serve` and serves the Kninz site at `http://localhost:4200` with live reload.

### Building the Angular client for production
```bash
cd client
npm run build
```
The build output is written to `client/dist/basagas-client/` and can be hosted from a CDN or reverse-proxied behind the API server.

## What this storefront includes
- Kninz-branded navigation and pages for home, shopping, lookbook/pricing, delivery coverage, ride-share info, and testimonials.
- Product gallery with ponchos, scarves, and hats plus quantity controls and a cart summary.
- Checkout form capturing delivery details, payment method selection (Yoco, PayGate, iKhokha), and a ride-share opt-in to lower courier costs.
- Express/Mongo API that validates items against the catalog and records delivery preferences and subtotal.
- Google Maps-based delivery coverage view.

## Testing
No automated tests ship with this MVP. You can lint or unit-test the Angular app with `npm run test` from the `client` folder once you have Chrome installed locally. The server exposes a placeholder `npm test` script.
