# iTaxi-Finder

Prototype implementation based on the iTaxi-Finder SRS. The project includes a minimal Node.js server and static frontend pages that display a Google Map and basic navigation.

## Prerequisites
- Node.js >= 18

## Setup
1. Clone the repository.
2. Ensure the `.env` file contains your Google Maps API key:
   ```
   GOOGLE_MAPS_API_KEY=AIzaSyCYxFkL9vcvbaFz-Ut1Lm2Vge5byodujfk
   PORT=3000
   ```
3. From the project root, install dependencies (none required for this prototype).

## Running the server
```
npm start
```
This starts a simple HTTP server at `http://localhost:3000` that serves the static client and a `/config` endpoint exposing the Maps API key.

## Testing
```
npm test
```
This script starts the server briefly to ensure it boots.

## Notes
The current build uses only Node.js built-in modules because package installation was not possible in the execution environment. The frontend is a static proof-of-concept and does not implement full MEAN stack features.
