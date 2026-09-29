const mongoose = require('mongoose');

const apiKeySchema = new mongoose.Schema({
  merchantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Merchant', required: true },
  keyHash: { type: String, required: true, unique: true },
  status: { type: String, enum: ['active', 'expiring', 'revoked'], default: 'active' },
  expiresAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ApiKey', apiKeySchema);
