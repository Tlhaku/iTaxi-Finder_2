const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  customer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  pickup_address: { type: String, required: true },
  dropoff_address: { type: String, required: true },
  cylinder_size: { type: String, required: true },
  manufacturer: { type: String, required: true },
  contact_phone: { type: String },
  notes: { type: String },
  status: { type: String, enum: ['Pending', 'Paid', 'Assigned', 'En-route', 'Delivered'], default: 'Pending' }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('Order', orderSchema);
