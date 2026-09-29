const apiKeyService = require('../services/ApiKeyService');

class ApiKeyController {
  async rotate(req, res) {
    try {
      const merchantId = req.merchant.id;
      const { gracePeriodHours } = req.body;
      
      const result = await apiKeyService.rotateKey(merchantId, gracePeriodHours);
      
      return res.status(200).json({
        success: true,
        apiKey: result.rawKey,
        expiresAt: result.apiKey.expiresAt
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }
}

module.exports = new ApiKeyController();
