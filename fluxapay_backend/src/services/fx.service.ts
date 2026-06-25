export class FxService {
  /**
   * Fetches the current exchange rate from Fiat to USDC.
   * For the purpose of this implementation, it uses a static mock rate
   * but can be easily swapped with an external API like OpenExchangeRates or CoinMarketCap.
   *
   * @param fiatCurrency 3-letter currency code (e.g. NGN, EUR, GBP)
   * @returns Exchange rate (1 unit of fiat = X USDC)
   */
  static async getUSDCExchangeRate(fiatCurrency: string): Promise<number> {
    const currency = fiatCurrency.toUpperCase();
    
    // Mock rates
    const mockRates: Record<string, number> = {
      USD: 1.0,
      EUR: 1.08,
      GBP: 1.25,
      NGN: 0.00065, // 1 NGN = 0.00065 USDC
    };

    if (mockRates[currency] !== undefined) {
      return mockRates[currency];
    }

    // Default mock rate for unknown currencies (assumes 1:1)
    return 1.0;
  }
}
