const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const csrf = require('csurf');
const http = require('http');
const { Server } = require('socket.io');

const User = require('./models/User');
const Order = require('./models/Order');
const Product = require('./models/Product');

dotenv.config();

const app = express();
const server = http.createServer(app);

const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:4200')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true
  }
});

const JWT_SECRET = process.env.JWT_SECRET || 'development-secret';
const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/kninz-store';

const DEFAULT_PRODUCTS = [
  {
    name: 'Snowy Whisper Poncho',
    type: 'poncho',
    price: 350,
    description: 'Feathery white poncho that drapes softly for effortless layering.',
    image: 'assets/kninz/photos/snowy-whisper-poncho.svg'
  },
  {
    name: 'Snowdrift Plush Scarf',
    type: 'scarf',
    price: 250,
    description: 'Plush snowy wrap that sits comfortably over tanks or tees.',
    image: 'assets/kninz/photos/snowdrift-plush-scarf.svg'
  },
  {
    name: 'Vanilla Embrace Shawl',
    type: 'poncho',
    price: 350,
    description: 'Cream triangle shawl with a lofty hand-knit texture.',
    image: 'assets/kninz/photos/vanilla-embrace-shawl.svg'
  },
  {
    name: 'Pearl Pin Capelet',
    type: 'poncho',
    price: 350,
    description: 'Chunky knit capelet finished with a vintage-style clasp.',
    image: 'assets/kninz/photos/pearl-pin-capelet.svg'
  },
  {
    name: 'Sapphire Fringe Poncho',
    type: 'poncho',
    price: 350,
    description: 'Bold cobalt poncho with playful fringe for joyful movement.',
    image: 'assets/kninz/photos/sapphire-fringe-poncho.svg'
  },
  {
    name: 'Heather Frost Cowl',
    type: 'scarf',
    price: 250,
    description: 'Frosted heather cowl that pulls on for instant coziness.',
    image: 'assets/kninz/photos/heather-frost-cowl.svg'
  },
  {
    name: 'Cobalt Velvet Scarf',
    type: 'scarf',
    price: 250,
    description: 'Deep cobalt scarf with plush loops and an easy drape.',
    image: 'assets/kninz/photos/cobalt-velvet-scarf.svg'
  },
  {
    name: 'Cobalt Velvet Poncho',
    type: 'poncho',
    price: 350,
    description: 'Ultra-soft cobalt poncho that feels like a wearable hug.',
    image: 'assets/kninz/photos/cobalt-velvet-poncho.svg'
  },
  {
    name: 'Cloud Beanie',
    type: 'hat',
    price: 150,
    description: 'Lightweight knit hat that pairs with every winter look.',
    image: 'assets/kninz/hat-cloud.svg'
  }
];

const liveLocations = new Map();
const yocoTokens = [];

async function connectToMongo() {
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 3000
    });
    console.log('Connected to MongoDB');
  } catch (error) {
    console.warn('MongoDB connection failed. Server will continue with limited capabilities.', error.message);
    throw error;
  }
}

async function seedCatalog() {
  try {
    const count = await Product.estimatedDocumentCount();
    if (count === 0) {
      await Product.insertMany(DEFAULT_PRODUCTS);
      console.log('Seeded default catalog items');
    }
  } catch (error) {
    console.warn('Unable to seed catalog items', error.message);
  }
}

connectToMongo().then(seedCatalog).catch(() => {});

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use(cookieParser());

const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
});
app.use(csrfProtection);

app.get('/api/csrf-token', (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

function generateToken(user) {
  return jwt.sign({ id: user._id, role: user.role, username: user.username }, JWT_SECRET, { expiresIn: '12h' });
}

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header) {
    return res.status(401).json({ message: 'Authorization required' });
  }
  const [, token] = header.split(' ');
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
}

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, role = 'customer' } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: 'Email already registered' });
    }
    const hashed = await bcrypt.hash(password, 12);
    const user = await User.create({
      ...req.body,
      role,
      password: hashed
    });
    const token = generateToken(user);
    res.json({ token, user: user.toJSON() });
  } catch (error) {
    console.error('Registration error', error);
    res.status(500).json({ message: 'Unable to register at the moment' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const token = generateToken(user);
    res.json({ token, user: user.toJSON() });
  } catch (error) {
    console.error('Login error', error);
    res.status(500).json({ message: 'Unable to login' });
  }
});

app.get('/api/auth/me', authenticate, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  res.json(user.toJSON());
});

app.get('/api/catalog', async (req, res) => {
  try {
    const items = await Product.find({ is_active: true }).sort({ name: 1 });
    res.json(items.map(item => item.toJSON()));
  } catch (error) {
    res.status(500).json({ message: 'Unable to load catalog' });
  }
});

app.post('/api/catalog', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Only admins can add catalog items' });
  }
  try {
    const { name, type, price, description, image, is_active = true } = req.body;
    if (!name || !type || !price || !description || !image) {
      return res.status(400).json({ message: 'Name, type, price, description, and image are required.' });
    }
    const product = await Product.create({ name, type, price, description, image, is_active });
    res.status(201).json(product.toJSON());
  } catch (error) {
    console.error('Catalog create error', error);
    res.status(500).json({ message: 'Unable to create catalog item' });
  }
});

app.post('/api/orders', authenticate, async (req, res) => {
  try {
    const { role } = req.user;
    if (role !== 'customer') {
      return res.status(403).json({ message: 'Only customers can place orders' });
    }

    const payloadItems = Array.isArray(req.body.items) ? req.body.items : [];
    const ids = payloadItems.map(i => i.productId).filter(Boolean);
    const catalog = await Product.find({ _id: { $in: ids }, is_active: true });

    const items = payloadItems
      .map(item => {
        const product = catalog.find(c => c._id.toString() === String(item.productId));
        if (!product) return null;
        const quantity = Math.max(1, Number(item.quantity || 0));
        if (!quantity) return null;
        return {
          name: product.name,
          type: product.type,
          price: product.price,
          quantity
        };
      })
      .filter(Boolean);

    if (items.length === 0) {
      return res.status(400).json({ message: 'Select at least one item before checking out.' });
    }

    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    const delivery = {
      recipient_name: req.body.delivery?.recipient_name,
      email: req.body.delivery?.email,
      phone: req.body.delivery?.phone,
      address: req.body.delivery?.address,
      city: req.body.delivery?.city,
      notes: req.body.delivery?.notes,
      ride_share: !!req.body.delivery?.ride_share,
      payment_method: req.body.delivery?.payment_method || 'Yoco'
    };

    if (!delivery.recipient_name || !delivery.address || !delivery.email || !delivery.phone) {
      return res.status(400).json({ message: 'Delivery contact, email, phone, and address are required.' });
    }

    const order = await Order.create({
      customer_id: req.user.id,
      items,
      subtotal,
      delivery,
      status: 'Pending'
    });
    res.json(order);
  } catch (error) {
    console.error('Order error', error);
    res.status(500).json({ message: 'Unable to capture order' });
  }
});

app.get('/api/orders', authenticate, async (req, res) => {
  try {
    const filter = req.user.role === 'customer' ? { customer_id: req.user.id } : {};
    const orders = await Order.find(filter).sort({ created_at: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: 'Unable to fetch orders' });
  }
});

app.post('/api/payments/yoco-token', (req, res) => {
  const { token, orderId } = req.body;
  if (token) {
    yocoTokens.push({ token, orderId, received: new Date().toISOString() });
  }
  res.json({ status: 'stored' });
});

app.post('/api/deliverers/broadcast', authenticate, async (req, res) => {
  if (req.user.role !== 'deliverer') {
    return res.status(403).json({ message: 'Only deliverers can broadcast' });
  }
  try {
    const user = await User.findByIdAndUpdate(req.user.id, { is_active_broadcast: !!req.body.isActive }, { new: true });
    if (!req.body.isActive) {
      removeLocation(req.user.id, false);
    }
    res.json(user ? user.toJSON() : {});
  } catch (error) {
    res.status(500).json({ message: 'Unable to update broadcast state' });
  }
});

app.get('/api/deliverers/locations', (req, res) => {
  res.json(Array.from(liveLocations.values()));
});

app.get('/api/config', (req, res) => {
  res.json({
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || 'AIzaSyCYxFkL9vcvbaFz-Ut1Lm2Vge5byodujfk',
    yocoPublicKey: process.env.YOCO_PUBLIC_KEY || 'pk_test_placeholder',
    paymentMethods: ['Yoco', 'PayGate', 'iKhokha']
  });
});

app.use((err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({ message: 'Invalid CSRF token' });
  }
  next(err);
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next();
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    socket.user = payload;
    next();
  } catch (error) {
    next(new Error('unauthorized'));
  }
});

io.on('connection', socket => {
  socket.on('deliverer-location', payload => {
    if (!socket.user || socket.user.role !== 'deliverer') {
      return;
    }
    const location = {
      user_id: socket.user.id,
      lat: payload.lat,
      lng: payload.lng,
      accuracy: payload.accuracy,
      username: payload.username || socket.user.username || 'Deliverer',
      updated: new Date().toISOString()
    };
    liveLocations.set(socket.user.id, location);
    io.emit('deliverer-location', location);
  });

  socket.on('disconnect', () => {
    if (socket.user?.role === 'deliverer') {
      removeLocation(socket.user.id, false);
    }
  });
});

function removeLocation(userId, silent) {
  if (liveLocations.has(userId)) {
    liveLocations.delete(userId);
    if (!silent) {
      io.emit('deliverer-offline', userId);
    }
  }
}

setInterval(() => {
  const cutoff = Date.now() - 120000;
  for (const [userId, location] of liveLocations.entries()) {
    if (new Date(location.updated).getTime() < cutoff) {
      liveLocations.delete(userId);
      io.emit('deliverer-offline', userId);
    }
  }
}, 30000);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
