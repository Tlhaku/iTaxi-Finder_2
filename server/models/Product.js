const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['poncho', 'scarf', 'hat'], required: true },
  price: { type: Number, required: true, min: 0 },
  description: { type: String, required: true },
  image: { type: String, required: true },
  is_active: { type: Boolean, default: true }
}, {
  timestamps: true
});

productSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject({ versionKey: false });
  return obj;
};

module.exports = mongoose.model('Product', productSchema);
