/**
 * Localized payment receipt strings. Add a locale by adding an entry here.
 * Missing keys fall back to the default locale (en) in the renderer.
 */
export interface ReceiptStrings {
  subject: string; // {amount} {currency} placeholders
  title: string;
  greeting: string; // {name}
  intro: string;
  details: string;
  amount: string;
  paymentId: string;
  reference: string;
  time: string;
  viewExplorer: string;
  footer: string;
  signature: string;
}

export const DEFAULT_LOCALE = "en";

export const PAYMENT_RECEIPT_CATALOG: Record<string, Partial<ReceiptStrings>> = {
  en: {
    subject: "Payment Confirmed - {amount} {currency}",
    title: "Payment Confirmed",
    greeting: "Hello {name},",
    intro: "Your payment has been successfully confirmed on the Stellar network.",
    details: "Payment Details",
    amount: "Amount",
    paymentId: "Payment ID",
    reference: "Reference",
    time: "Time",
    viewExplorer: "View on Stellar Explorer",
    footer: "This is an automated confirmation email. If you have any questions, please contact support.",
    signature: "The FluxaPay Team",
  },
  es: {
    subject: "Pago confirmado - {amount} {currency}",
    title: "Pago confirmado",
    greeting: "Hola {name},",
    intro: "Su pago ha sido confirmado correctamente en la red Stellar.",
    details: "Detalles del pago",
    amount: "Importe",
    paymentId: "ID de pago",
    reference: "Referencia",
    time: "Hora",
    viewExplorer: "Ver en Stellar Explorer",
    footer: "Este es un correo de confirmación automático. Si tiene preguntas, contacte con soporte.",
    signature: "El equipo de FluxaPay",
  },
  fr: {
    subject: "Paiement confirmé - {amount} {currency}",
    title: "Paiement confirmé",
    greeting: "Bonjour {name},",
    intro: "Votre paiement a été confirmé avec succès sur le réseau Stellar.",
    details: "Détails du paiement",
    amount: "Montant",
    paymentId: "ID de paiement",
    reference: "Référence",
    time: "Heure",
    viewExplorer: "Voir sur Stellar Explorer",
    footer: "Ceci est un e-mail de confirmation automatique. Pour toute question, contactez le support.",
    signature: "L'équipe FluxaPay",
  },
  pt: {
    subject: "Pagamento confirmado - {amount} {currency}",
    title: "Pagamento confirmado",
    greeting: "Olá {name},",
    intro: "O seu pagamento foi confirmado com sucesso na rede Stellar.",
    details: "Detalhes do pagamento",
    amount: "Valor",
    paymentId: "ID do pagamento",
    reference: "Referência",
    time: "Hora",
    viewExplorer: "Ver no Stellar Explorer",
    footer: "Este é um e-mail de confirmação automático. Em caso de dúvidas, contacte o suporte.",
    signature: "A equipa FluxaPay",
  },
  de: {
    subject: "Zahlung bestätigt - {amount} {currency}",
    title: "Zahlung bestätigt",
    greeting: "Hallo {name},",
    intro: "Ihre Zahlung wurde im Stellar-Netzwerk erfolgreich bestätigt.",
    details: "Zahlungsdetails",
    amount: "Betrag",
    paymentId: "Zahlungs-ID",
    reference: "Referenz",
    time: "Zeit",
    viewExplorer: "Im Stellar Explorer ansehen",
    footer: "Dies ist eine automatische Bestätigung. Bei Fragen wenden Sie sich bitte an den Support.",
    signature: "Das FluxaPay-Team",
  },
  sw: {
    subject: "Malipo yamethibitishwa - {amount} {currency}",
    title: "Malipo yamethibitishwa",
    greeting: "Habari {name},",
    intro: "Malipo yako yamethibitishwa kwa mafanikio kwenye mtandao wa Stellar.",
    details: "Maelezo ya malipo",
    amount: "Kiasi",
    paymentId: "Kitambulisho cha malipo",
    reference: "Rejea",
    time: "Muda",
    viewExplorer: "Tazama kwenye Stellar Explorer",
    footer: "Huu ni barua pepe ya uthibitisho wa kiotomatiki. Kwa maswali, wasiliana na msaada.",
    signature: "Timu ya FluxaPay",
  },
};
