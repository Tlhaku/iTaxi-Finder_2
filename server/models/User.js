const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, required: true },
  role: { type: String, enum: ['customer', 'deliverer', 'admin'], default: 'customer' },
  cylinder_manufacturer: { type: String },
  usual_pickup_address: { type: String },
  usual_dropoff_address: { type: String },
  starting_point: { type: String },
  password: { type: String, required: true },
  is_active_broadcast: { type: Boolean, default: false }
}, {
  timestamps: true
});

userSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject({ versionKey: false });
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
