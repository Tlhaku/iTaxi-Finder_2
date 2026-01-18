const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true, min: 1 }
}, { _id: false });

const deliverySchema = new mongoose.Schema({
  recipient_name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  address: { type: String, required: true },
  city: { type: String },
  notes: { type: String },
  ride_share: { type: Boolean, default: false },
  payment_method: { type: String, default: 'Yoco' }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  customer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: { type: [itemSchema], default: [] },
  subtotal: { type: Number, required: true },
  delivery: { type: deliverySchema, required: true },
  status: {
    type: String,
    enum: ['Pending', 'Paid', 'Assigned', 'En-route', 'Delivered'],
    default: 'Pending'
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('Order', orderSchema);
