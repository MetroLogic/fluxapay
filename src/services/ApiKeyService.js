const crypto = require('crypto');
const ApiKey = require('../models/ApiKey');

class ApiKeyService {
  async rotateKey(merchantId, gracePeriodHours = 24) {
    const existingKeys = await ApiKey.find({ merchantId, status: 'active' });
    
    const now = new Date();
    const expiresAt = new Date(now.getTime() + gracePeriodHours * 60 * 60 * 1000);

    for (const key of existingKeys) {
      key.status = 'expiring';
      key.expiresAt = expiresAt;
      await key.save();
    }

    const rawKey = 'flx_' + crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const newApiKey = await ApiKey.create({
      merchantId,
      keyHash,
      status: 'active',
      expiresAt: null
    });

    return {
      rawKey,
      apiKey: newApiKey
    };
  }

  async validateKey(rawKey) {
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const apiKey = await ApiKey.findOne({ keyHash });

    if (!apiKey) {
      return null;
    }

    if (apiKey.status === 'revoked') {
      return null;
    }

    if (apiKey.status === 'expiring' && apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      apiKey.status = 'revoked';
      await apiKey.save();
      return null;
    }

    return apiKey;
  }
}

module.exports = new ApiKeyService();
