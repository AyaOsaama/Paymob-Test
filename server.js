const express = require("express");
const cors = require("cors");
const { getToken, createOrder, createPaymentKey } = require("./paymob");
const fs = require("fs");
const path = require("path");

require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Orders storage
const ordersPath = path.join(__dirname, "orders.json");
if (!fs.existsSync(ordersPath)) fs.writeFileSync(ordersPath, "[]");

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Pay route
app.post("/pay", async (req, res) => {
  try {
    const { amount, bookId } = req.body;
    const amountCents = amount * 100;

    const token = await getToken();
    const orderId = await createOrder(token, amountCents, bookId);
    const paymentToken = await createPaymentKey(token, orderId, amountCents);

    const iframeUrl = `https://accept.paymobsolutions.com/api/acceptance/iframes/${process.env.PAYMOB_IFRAME_ID}?payment_token=${paymentToken}`;

    // Simulate saving the order
    const orders = readJSON(ordersPath);
    orders.push({ orderId, bookId, paid: false, accessKey: null });
    writeJSON(ordersPath, orders);

    res.json({ url: iframeUrl, orderId });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "حدث خطأ في الدفع" });
  }
});

// Verify route
app.get("/verify/:orderId", (req, res) => {
  const { orderId } = req.params;
  const orders = readJSON(ordersPath);
  const order = orders.find((o) => o.orderId == orderId);

  if (!order) return res.json({ status: "not paid" });

  // Simulate marking paid after iframe return
  order.paid = true;
  order.accessKey = Math.random().toString(36).substring(2);
  writeJSON(ordersPath, orders);

  res.json({ status: "paid", bookId: order.bookId, accessKey: order.accessKey });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

module.exports = { getToken, createOrder, createPaymentKey };
