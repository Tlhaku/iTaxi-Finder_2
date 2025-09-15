require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Config endpoint exposes Google Maps API key
app.get('/config', (req, res) => {
  res.json({ googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '' });
});

// Routes CRUD (placeholders)
app.get('/api/routes', (req, res) => {
  res.json([]);
});

app.post('/api/routes', (req, res) => {
  res.status(201).json({ message: 'Route created' });
});

app.put('/api/routes/:id', (req, res) => {
  res.json({ message: `Route ${req.params.id} updated` });
});

// Roads API proxy stub
app.post('/api/roads/snap', (req, res) => {
  res.json({ snappedPoints: [] });
});

// TripChain suggestion stub
app.post('/api/tripchain/suggest', (req, res) => {
  res.json({ tripChain: [] });
});

// Orders endpoints stub
app.post('/api/orders', (req, res) => {
  res.status(201).json({ orderId: 'placeholder' });
});

app.get('/api/orders/:id', (req, res) => {
  res.json({ orderId: req.params.id });
});

app.post('/api/orders/:id/scan', (req, res) => {
  res.json({ message: `Order ${req.params.id} scanned` });
});

app.listen(port, () => {
  console.log(`iTaxi-Finder server listening on port ${port}`);
});
