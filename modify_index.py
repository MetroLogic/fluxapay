import re

with open('fluxapay_sdk/src/index.ts', 'r') as f:
    content = f.read()

# 1. Update FluxaPayConfig
content = content.replace(
"""export interface FluxaPayConfig {
  /** Your secret API key (keep server-side). */
  apiKey: string;
  /**
   * Base URL of the FluxaPay backend.
   * Defaults to the hosted production URL.
   */
  baseUrl?: string;
}""", 
"""export interface FluxaPayConfig {
  /** Your secret API key (keep server-side). */
  apiKey: string;
  /**
   * Base URL of the FluxaPay backend.
   * Defaults to the hosted production URL.
   */
  baseUrl?: string;
  /**
   * Number of retries for transient 5xx errors and network failures.
   * Defaults to 3. Set to 0 to disable retries.
   */
  retries?: number;
}""")

# 2. Update FluxaPay constructor
content = content.replace(
"""export class FluxaPay {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: FluxaPayConfig) {
    if (!config.apiKey) throw new Error('FluxaPay: apiKey is required');
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\\/$/, '');
  }""",
"""export class FluxaPay {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly retries: number;

  constructor(config: FluxaPayConfig) {
    if (!config.apiKey) throw new Error('FluxaPay: apiKey is required');
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\\/$/, '');
    this.retries = config.retries ?? 3;
  }""")

# 3. Update request function
old_request = """async function request<T>(
  baseUrl: string,
  apiKey: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'X-API-Version': API_VERSION,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const body = json as { message?: string; code?: string } | null;
    throw new FluxaPayError(
      res.status,
      body?.message ?? `HTTP ${res.status}`,
      body?.code,
      json,
    );
  }

  return json as T;
}"""

new_request = """async function request<T>(
  baseUrl: string,
  apiKey: string,
  method: string,
  path: string,
  body?: unknown,
  maxRetries: number = 3,
): Promise<T> {
  let attempt = 0;
  const url = `${baseUrl}${path}`;
  
  while (true) {
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'X-API-Version': API_VERSION,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      if (attempt < maxRetries) {
        attempt++;
        const delayMs = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 10000);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }

    const isRetryable = res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504;
    
    if (!res.ok && isRetryable && attempt < maxRetries) {
      attempt++;
      let delayMs = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 10000);
      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        if (retryAfter) {
          const parsed = parseInt(retryAfter, 10);
          if (!isNaN(parsed)) delayMs = parsed * 1000;
        }
      }
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      const body = json as { message?: string; code?: string } | null;
      throw new FluxaPayError(
        res.status,
        body?.message ?? `HTTP ${res.status}`,
        body?.code,
        json,
      );
    }

    return json as T;
  }
}"""

content = content.replace(old_request, new_request)

# 4. Replace request calls in FluxaPay methods
# e.g., request<Payment>(this.baseUrl, this.apiKey, 'POST', '/api/payments', params)
# becomes request<Payment>(this.baseUrl, this.apiKey, 'POST', '/api/payments', params, this.retries)
# There are variations in type arguments and arguments.
# A regex search-and-replace to append this.retries.
def repl(m):
    # m.group(1) is the opening request( or request<T>(
    # m.group(2) is the inner arguments
    # We want to add this.retries if it's not already there
    # Wait, we can just replace 'request' with a lambda or bind?
    # No, it's easier to just match the calls.
    inner = m.group(2)
    # Check if this.retries is already added
    if 'this.retries' in inner:
        return m.group(0)
    
    # We have up to 5 arguments for request. If it's less than 5, we might need to add `undefined`.
    # E.g. request(baseUrl, apiKey, 'GET', '/path') -> request(..., undefined, this.retries)
    parts = inner.split(',')
    num_args = len(parts) # Roughly, if no nested commas
    if inner.count('{') > 0:
      # If there's a JSON object in the args, splitting by comma is hard.
      # Let's just find `)` and insert `, this.retries` or `, undefined, this.retries`
      pass
      
    return m.group(0)

# Instead of complex regex, let's just do simple string replacements for the 13 lines:
lines_to_replace = [
    ("request<Payment>(this.baseUrl, this.apiKey, 'POST', '/api/payments', params)", "request<Payment>(this.baseUrl, this.apiKey, 'POST', '/api/payments', params, this.retries)"),
    ("request<Payment>(this.baseUrl, this.apiKey, 'GET', `/api/payments/${paymentId}`)", "request<Payment>(this.baseUrl, this.apiKey, 'GET', `/api/payments/${paymentId}`, undefined, this.retries)"),
    ("request<PaymentStatus>(this.baseUrl, this.apiKey, 'GET', `/api/payments/${paymentId}`)", "request<PaymentStatus>(this.baseUrl, this.apiKey, 'GET', `/api/payments/${paymentId}`, undefined, this.retries)"),
    ("request(this.baseUrl, this.apiKey, 'GET', `/api/payments${query ? `?${query}` : ''}`)", "request(this.baseUrl, this.apiKey, 'GET', `/api/payments${query ? `?${query}` : ''}`, undefined, this.retries)"),
    ("request(this.baseUrl, this.apiKey, 'GET', `/api/settlements${query ? `?${query}` : ''}`)", "request(this.baseUrl, this.apiKey, 'GET', `/api/settlements${query ? `?${query}` : ''}`, undefined, this.retries)"),
    ("request(this.baseUrl, this.apiKey, 'GET', '/api/settlements/summary')", "request(this.baseUrl, this.apiKey, 'GET', '/api/settlements/summary', undefined, this.retries)"),
    ("request(this.baseUrl, this.apiKey, 'GET', `/api/settlements/${settlementId}`)", "request(this.baseUrl, this.apiKey, 'GET', `/api/settlements/${settlementId}`, undefined, this.retries)"),
    ("request(this.baseUrl, this.apiKey, 'GET', `/api/settlements/${settlementId}/export?format=${format}`)", "request(this.baseUrl, this.apiKey, 'GET', `/api/settlements/${settlementId}/export?format=${format}`, undefined, this.retries)"),
    ("request(this.baseUrl, this.apiKey, 'GET', '/api/merchants/me')", "request(this.baseUrl, this.apiKey, 'GET', '/api/merchants/me', undefined, this.retries)"),
    ("request(this.baseUrl, this.apiKey, 'PATCH', '/api/merchants/me', data)", "request(this.baseUrl, this.apiKey, 'PATCH', '/api/merchants/me', data, this.retries)"),
    ("request(this.baseUrl, this.apiKey, 'PATCH', '/api/merchants/me/webhook', { webhook_url })", "request(this.baseUrl, this.apiKey, 'PATCH', '/api/merchants/me/webhook', { webhook_url }, this.retries)"),
    ("request(this.baseUrl, this.apiKey, 'PATCH', '/api/merchants/me/settlement-schedule', data)", "request(this.baseUrl, this.apiKey, 'PATCH', '/api/merchants/me/settlement-schedule', data, this.retries)"),
    ("request(this.baseUrl, this.apiKey, 'POST', '/api/merchants/me/bank-account', data)", "request(this.baseUrl, this.apiKey, 'POST', '/api/merchants/me/bank-account', data, this.retries)"),
    ("request<Invoice>(this.baseUrl, this.apiKey, 'POST', '/api/invoices', params)", "request<Invoice>(this.baseUrl, this.apiKey, 'POST', '/api/invoices', params, this.retries)"),
    ("request<Invoice>(this.baseUrl, this.apiKey, 'GET', `/api/invoices/${invoiceId}`)", "request<Invoice>(this.baseUrl, this.apiKey, 'GET', `/api/invoices/${invoiceId}`, undefined, this.retries)"),
    ("request(this.baseUrl, this.apiKey, 'GET', `/api/invoices${query ? `?${query}` : ''}`)", "request(this.baseUrl, this.apiKey, 'GET', `/api/invoices${query ? `?${query}` : ''}`, undefined, this.retries)"),
    ("request<Invoice>(this.baseUrl, this.apiKey, 'PATCH', `/api/invoices/${invoiceId}/status`, { status })", "request<Invoice>(this.baseUrl, this.apiKey, 'PATCH', `/api/invoices/${invoiceId}/status`, { status }, this.retries)")
]

for old, new_s in lines_to_replace:
    content = content.replace(old, new_s)

with open('fluxapay_sdk/src/index.ts', 'w') as f:
    f.write(content)
