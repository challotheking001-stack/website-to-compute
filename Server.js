import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Stripe from "stripe";
import paypal from "@paypal/checkout-server-sdk";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors({
  origin: process.env.CORS_ORIGIN || "*"
}));

// ------------------ PLAN CATALOG ------------------
const PLANS = {
  free:          { price: "0.00",  currency: "USD", label: "Free" },
  pro:           { price: "10.00", currency: "USD", label: "Pro" },
  professional:  { price: "20.00", currency: "USD", label: "Professional" },
  enterprise:    { price: "50.00", currency: "USD", label: "Enterprise" }
};

// ------------------ STRIPE ------------------
const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripe = new Stripe(stripeSecret, { apiVersion: "2024-06-20" });

app.post("/api/stripe/create-payment-intent", async (req, res) => {
  try {
    const { plan } = req.body || {};
    const cfg = PLANS[plan];
    if (!cfg) return res.status(400).json({ error: "Invalid plan" });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(parseFloat(cfg.price) * 100), // cents
      currency: cfg.currency.toLowerCase(),
      automatic_payment_methods: { enabled: true }
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error("Stripe error:", err);
    res.status(500).json({ error: "Stripe create-payment-intent failed" });
  }
});

// ------------------ PAYPAL ------------------
function getPayPalClient() {
  const mode = (process.env.PAYPAL_MODE || "sandbox").toLowerCase();
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  const env = mode === "live"
    ? new paypal.core.LiveEnvironment(clientId, clientSecret)
    : new paypal.core.SandboxEnvironment(clientId, clientSecret);

  return new paypal.core.PayPalHttpClient(env);
}

app.post("/api/paypal/create-order", async (req, res) => {
  try {
    const { plan } = req.body || {};
    const cfg = PLANS[plan];
    if (!cfg) return res.status(400).json({ error: "Invalid plan" });

    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
      intent: "CAPTURE",
      purchase_units: [{
        amount: { currency_code: cfg.currency, value: cfg.price }
      }]
    });

    const order = await getPayPalClient().execute(request);
    res.json({ id: order.result.id });
  } catch (err) {
    console.error("PayPal create error:", err);
    res.status(500).json({ error: "PayPal create-order failed" });
  }
});

app.post("/api/paypal/capture-order/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    const request = new paypal.orders.OrdersCaptureRequest(orderId);
    request.requestBody({});

    const capture = await getPayPalClient().execute(request);
    const status = capture?.result?.status;
    res.json({ success: status === "COMPLETED", status, raw: capture.result });
  } catch (err) {
    console.error("PayPal capture error:", err);
    res.status(500).json({ error: "PayPal capture failed" });
  }
});

// ------------------ ROOT ------------------
app.get("/", (_, res) => {
  res.send("✅ King123 Payments API (Stripe + PayPal) is running");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
