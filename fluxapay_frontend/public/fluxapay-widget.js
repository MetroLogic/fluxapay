/**
 * FluxaPay Checkout Widget
 * One-line integration for embedding payment checkout on your website
 * 
 * Usage:
 * <script src="https://cdn.fluxapay.com/widget.js"></script>
 * <div id="fluxapay-checkout"></div>
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
  const FluxaPay = {
    version: "1.0.0",
    apiUrl: window.FLUXAPAY_API_URL || "http://localhost:3001",

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

      const iframe = document.createElement("iframe");
      iframe.src = checkoutUrl;
      iframe.style.width = "100%";
      iframe.style.height = "100%";
      iframe.style.border = "none";
      iframe.style.borderRadius = "8px";
      iframe.setAttribute("title", "FluxaPay Checkout");
      iframe.setAttribute("allow", "payment");

      container.appendChild(iframe);
    },

    /**
     * Render modal checkout
     */
    renderModal: function (checkoutUrl, merchantName, amount, currency) {
      // Create modal overlay
      const overlay = document.createElement("div");
      overlay.id = "fluxapay-modal-overlay";
      overlay.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 9999;
        background-color: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
      `;

      // Create modal container
      const modal = document.createElement("div");
      modal.id = "fluxapay-modal";
      modal.style.cssText = `
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
      `;

      // Create header
      const header = document.createElement("div");
      header.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px;
        border-bottom: 1px solid #e2e8f0;
      `;

      const headerContent = document.createElement("div");
      const title = document.createElement("h2");
      title.textContent = merchantName || "Complete Payment";
      title.style.cssText = `
        font-size: 18px;
        font-weight: bold;
        color: #111827;
        margin: 0;
      `;
      headerContent.appendChild(title);

      if (merchantName) {
        const subtitle = document.createElement("p");
        subtitle.textContent = "Payment to";
        subtitle.style.cssText = `
          font-size: 12px;
          color: #6b7280;
          margin: 0;
        `;
        headerContent.insertBefore(subtitle, title);
      }

      const closeBtn = document.createElement("button");
      closeBtn.innerHTML = "✕";
      closeBtn.style.cssText = `
        padding: 8px;
        background-color: transparent;
        border: none;
        cursor: pointer;
        font-size: 20px;
        color: #6b7280;
        transition: background-color 0.2s;
      `;
      closeBtn.onmouseover = () => {
        closeBtn.style.backgroundColor = "#f3f4f6";
      };
      closeBtn.onmouseout = () => {
        closeBtn.style.backgroundColor = "transparent";
      };
      closeBtn.onclick = () => this.closeModal();

      header.appendChild(headerContent);
      header.appendChild(closeBtn);

      // Create iframe container
      const iframeContainer = document.createElement("div");
      iframeContainer.style.cssText = `
        flex: 1;
        overflow: hidden;
        height: calc(90vh - 80px);
      `;

      const iframe = document.createElement("iframe");
      iframe.src = checkoutUrl;
      iframe.style.cssText = `
        width: 100%;
        height: 100%;
        border: none;
      `;
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
