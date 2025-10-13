const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Simple in-memory routes placeholder
const routes = [
  {
    routeId: 'sample',
    name: 'Sample Route',
    pointAName: 'Downtown Taxi Rank',
    pointBName: 'Airport Terminal A',
    notes: 'Peak-hour taxis run every 10 minutes. Expect light traffic after 19:00.',
    fare: { min: 10, max: 15, currency: 'ZAR' },
    gesture: 'raise hand',
    stops: [{ name: 'Stop A', lat: -26.2041, lng: 28.0473 }],
    frequencyPerHour: 5,
    path: [],
    snappedPath: []
  }
];

app.get('/api/routes', (req, res) => {
  res.json(routes);
});

app.get('/config', (req, res) => {
  res.json({
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || ''
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
