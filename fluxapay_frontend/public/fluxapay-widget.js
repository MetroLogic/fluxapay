/**
 * FluxaPay Checkout Widget
 * One-line integration for embedding payment checkout on your website
 * 
 * Usage:
 * <script src="https://cdn.fluxapay.com/widget.js"></script>
 * <div id="fluxapay-checkout"></div>
 *
 * Content Security Policy:
 * If your page enforces a strict CSP, pass your per-request nonce on the
 * script tag and the widget will apply it to everything it injects:
 *
 * <script src="https://cdn.fluxapay.com/widget.js" data-nonce="YOUR_NONCE"></script>
 *
 * See docs/checkout-widget-csp.md for the full integration guide.
 * <script>
 *   FluxaPay.checkout({
 *     paymentId: 'pay_abc123',
 *     amount: 100.00,
 *     currency: 'USDC',
 *     merchantName: 'Your Store',
 *     customization: {
 *       primaryColor: '#f59e0b',
 *       logoUrl: 'https://yoursite.com/logo.png'
 *     },
 *     callbacks: {
 *       onSuccess: (paymentId) => console.log('Payment successful:', paymentId),
 *       onCancel: () => console.log('Payment cancelled'),
 *       onError: (error) => console.error('Payment error:', error)
 *     }
 *   });
 * </script>
 */

(function (window) {
  const STYLE_ELEMENT_ID = "fluxapay-widget-styles";

  /**
   * Resolve the CSP nonce for this widget.
   *
   * `document.currentScript` is the widget's own <script> during initial
   * evaluation, which is where the merchant puts `data-nonce`. It is null by
   * the time a callback runs, so the value is read once at load and cached.
   * The query-selector fallback covers loaders that inject the script
   * asynchronously, where `currentScript` is null even at evaluation time.
   */
  function resolveNonce() {
    const own = document.currentScript;
    if (own && own.getAttribute("data-nonce")) {
      return own.getAttribute("data-nonce");
    }

    const tagged = document.querySelector("script[data-fluxapay-widget][data-nonce]");
    if (tagged) return tagged.getAttribute("data-nonce");

    const bySrc = document.querySelector('script[src*="fluxapay-widget"][data-nonce], script[src*="widget.js"][data-nonce]');
    if (bySrc) return bySrc.getAttribute("data-nonce");

    return window.FLUXAPAY_CSP_NONCE || null;
  }

  const CSP_NONCE = resolveNonce();

  /**
   * Apply the nonce to a dynamically created <script> or <style>.
   *
   * Both the property and the attribute are set: browsers hide `nonce` as a
   * content attribute after parsing to stop it leaking through CSS selectors,
   * so the IDL property is what the CSP check actually reads, while the
   * attribute keeps the element inspectable for anything cloning it.
   */
  function applyNonce(element) {
    if (!CSP_NONCE) return element;
    element.setAttribute("nonce", CSP_NONCE);
    element.nonce = CSP_NONCE;
    return element;
  }

  /**
   * The widget's styles, injected once as a single nonced <style> element.
   *
   * These used to be `element.style.cssText = ...` inline style attributes.
   * A nonce cannot whitelist a style *attribute* — CSP only nonces <style>
   * elements — so under a strict `style-src` the widget rendered unstyled
   * regardless of configuration. Moving to classes in one stylesheet is what
   * actually makes it CSP-compatible.
   */
  const WIDGET_CSS = `
.fluxapay-embedded-iframe {
  width: 100%;
  height: 100%;
  border: none;
  border-radius: 8px;
}
.fluxapay-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background-color: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.fluxapay-modal {
  position: relative;
  background-color: white;
  border-radius: 16px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  width: 100%;
  max-width: 512px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.fluxapay-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid #e2e8f0;
}
.fluxapay-modal-title {
  font-size: 18px;
  font-weight: bold;
  color: #111827;
  margin: 0;
}
.fluxapay-modal-subtitle {
  font-size: 12px;
  color: #6b7280;
  margin: 0;
}
.fluxapay-modal-close {
  padding: 8px;
  background-color: transparent;
  border: none;
  cursor: pointer;
  font-size: 20px;
  color: #6b7280;
  transition: background-color 0.2s;
}
.fluxapay-modal-close:hover,
.fluxapay-modal-close:focus-visible {
  background-color: #f3f4f6;
}
.fluxapay-modal-body {
  flex: 1;
  overflow: hidden;
  height: calc(90vh - 80px);
}
.fluxapay-modal-iframe {
  width: 100%;
  height: 100%;
  border: none;
}
`;

  /** Inject the stylesheet once per page, carrying the nonce if there is one. */
  function ensureStyles() {
    if (document.getElementById(STYLE_ELEMENT_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ELEMENT_ID;
    style.textContent = WIDGET_CSS;
    applyNonce(style);
    document.head.appendChild(style);
  }

  const FluxaPay = {
    version: "1.0.0",
    apiUrl: window.FLUXAPAY_API_URL || "http://localhost:3001",

    /** The CSP nonce in force, or null when the host page did not supply one. */
    nonce: CSP_NONCE,

    /**
     * Create an element with the widget's nonce already applied.
     * Exposed so host integrations injecting their own <script>/<style>
     * alongside the widget can reuse the same nonce.
     */
    createNoncedElement: function (tagName) {
      return applyNonce(document.createElement(tagName));
    },

    /**
     * Initialize checkout widget
     * @param {Object} config - Configuration object
     * @param {string} config.paymentId - Payment ID from FluxaPay API
     * @param {number} config.amount - Payment amount
     * @param {string} config.currency - Currency code (USDC, XLM)
     * @param {string} [config.merchantName] - Merchant name to display
     * @param {string} [config.description] - Payment description
     * @param {Object} [config.customization] - Customization options
     * @param {string} [config.customization.primaryColor] - Primary color (hex)
     * @param {string} [config.customization.logoUrl] - Logo URL
     * @param {string} [config.customization.accentColor] - Accent color (hex)
     * @param {Object} [config.callbacks] - Event callbacks
     * @param {Function} [config.callbacks.onSuccess] - Called on successful payment
     * @param {Function} [config.callbacks.onCancel] - Called when payment is cancelled
     * @param {Function} [config.callbacks.onError] - Called on payment error
     * @param {string} [config.containerId] - ID of container element (default: 'fluxapay-checkout')
     * @param {string} [config.mode] - 'modal' or 'embedded' (default: 'modal')
     */
    checkout: function (config) {
      const {
        paymentId,
        amount,
        currency,
        merchantName,
        description,
        customization = {},
        callbacks = {},
        containerId = "fluxapay-checkout",
        mode = "modal",
      } = config;

      if (!paymentId) {
        console.error("FluxaPay: paymentId is required");
        return;
      }

      // Build checkout URL
      const checkoutUrl = new URL(`${this.apiUrl}/pay/${paymentId}`);
      if (customization.primaryColor) {
        checkoutUrl.searchParams.set("primaryColor", customization.primaryColor);
      }
      if (customization.logoUrl) {
        checkoutUrl.searchParams.set("logoUrl", customization.logoUrl);
      }
      if (customization.accentColor) {
        checkoutUrl.searchParams.set("accentColor", customization.accentColor);
      }

      // Handle messages from iframe
      const handleMessage = (event) => {
        // Verify origin
        if (!event.origin.includes("fluxapay")) return;

        const { type, data } = event.data;

        switch (type) {
          case "payment.success":
            callbacks.onSuccess?.(data.paymentId);
            if (mode === "modal") {
              this.closeModal();
            }
            break;
          case "payment.cancel":
            callbacks.onCancel?.();
            if (mode === "modal") {
              this.closeModal();
            }
            break;
          case "payment.error":
            callbacks.onError?.(data.error);
            break;
        }
      };

      window.addEventListener("message", handleMessage.bind(this));

      if (mode === "embedded") {
        this.renderEmbedded(containerId, checkoutUrl.toString());
      } else {
        this.renderModal(checkoutUrl.toString(), merchantName, amount, currency);
      }
    },

    /**
     * Render embedded checkout
     */
    renderEmbedded: function (containerId, checkoutUrl) {
      const container = document.getElementById(containerId);
      if (!container) {
        console.error(`FluxaPay: Container with id '${containerId}' not found`);
        return;
      }

      ensureStyles();

      const iframe = document.createElement("iframe");
      iframe.src = checkoutUrl;
      iframe.className = "fluxapay-embedded-iframe";
      iframe.setAttribute("title", "FluxaPay Checkout");
      iframe.setAttribute("allow", "payment");

      container.appendChild(iframe);
    },

    /**
     * Render modal checkout
     */
    renderModal: function (checkoutUrl, merchantName, amount, currency) {
      ensureStyles();

      // Create modal overlay
      const overlay = document.createElement("div");
      overlay.id = "fluxapay-modal-overlay";
      overlay.className = "fluxapay-modal-overlay";

      // Create modal container
      const modal = document.createElement("div");
      modal.id = "fluxapay-modal";
      modal.className = "fluxapay-modal";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-label", merchantName ? `Pay ${merchantName}` : "Complete Payment");

      // Create header
      const header = document.createElement("div");
      header.className = "fluxapay-modal-header";

      const headerContent = document.createElement("div");
      const title = document.createElement("h2");
      title.textContent = merchantName || "Complete Payment";
      title.className = "fluxapay-modal-title";
      headerContent.appendChild(title);

      if (merchantName) {
        const subtitle = document.createElement("p");
        subtitle.textContent = "Payment to";
        subtitle.className = "fluxapay-modal-subtitle";
        headerContent.insertBefore(subtitle, title);
      }

      const closeBtn = document.createElement("button");
      // textContent rather than innerHTML: nothing here needs parsing as HTML.
      closeBtn.textContent = "\u2715";
      closeBtn.className = "fluxapay-modal-close";
      closeBtn.setAttribute("type", "button");
      closeBtn.setAttribute("aria-label", "Close payment dialog");
      // Hover is handled by the stylesheet now — assigning to element.style
      // would be an inline style attribute, which a nonce cannot whitelist.
      closeBtn.onclick = () => this.closeModal();

      header.appendChild(headerContent);
      header.appendChild(closeBtn);

      // Create iframe container
      const iframeContainer = document.createElement("div");
      iframeContainer.className = "fluxapay-modal-body";

      const iframe = document.createElement("iframe");
      iframe.src = checkoutUrl;
      iframe.className = "fluxapay-modal-iframe";
      iframe.setAttribute("title", "FluxaPay Checkout");
      iframe.setAttribute("allow", "payment");

      iframeContainer.appendChild(iframe);

      // Assemble modal
      modal.appendChild(header);
      modal.appendChild(iframeContainer);

      // Close on overlay click
      overlay.onclick = (e) => {
        if (e.target === overlay) {
          this.closeModal();
        }
      };

      overlay.appendChild(modal);
      document.body.appendChild(overlay);
    },

    /**
     * Close modal
     */
    closeModal: function () {
      const overlay = document.getElementById("fluxapay-modal-overlay");
      if (overlay) {
        overlay.remove();
      }
    },
  };

  // Expose to global scope
  window.FluxaPay = FluxaPay;
})(window);
