const assert = require('assert');
const mongoose = require('mongoose');
const apiKeyService = require('../src/services/ApiKeyService');
const ApiKey = require('../src/models/ApiKey');

describe('ApiKey Rotation Service', () => {
  const merchantId = new mongoose.Types.ObjectId();

  beforeEach(async () => {
    await ApiKey.deleteMany({});
  });

  it('should allow old key and new key during grace period', async () => {
    const firstRotation = await apiKeyService.rotateKey(merchantId, 24);
    const oldKeyRaw = firstRotation.rawKey;

    const secondRotation = await apiKeyService.rotateKey(merchantId, 24);
    const newKeyRaw = secondRotation.rawKey;

    const validatedOld = await apiKeyService.validateKey(oldKeyRaw);
    const validatedNew = await apiKeyService.validateKey(newKeyRaw);

    assert.notStrictEqual(validatedOld, null);
    assert.strictEqual(validatedOld.status, 'expiring');
    
    assert.notStrictEqual(validatedNew, null);
    assert.strictEqual(validatedNew.status, 'active');
  });
});
