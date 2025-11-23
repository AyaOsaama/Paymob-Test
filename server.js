const express = require("express");
const cors = require("cors");
const { getToken, createOrder, createPaymentKey } = require("./paymob");

require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// -------------------------
// Pay route فقط
// -------------------------
app.post("/pay", async (req, res) => {
  try {
    const { amount, bookId } = req.body;
    const amountCents = amount * 100;

    // 1) Get auth token
    const token = await getToken();

    // 2) Create order
    const orderId = await createOrder(token, amountCents, bookId);

    // 3) Create payment key
    const paymentToken = await createPaymentKey(token, orderId, amountCents);

    // رابط iframe فقط
    const iframeUrl = `https://accept.paymobsolutions.com/api/acceptance/iframes/${process.env.PAYMOB_IFRAME_ID}?payment_token=${paymentToken}`;

    res.json({ url: iframeUrl, orderId });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "حدث خطأ في الدفع" });
  }
});

// -------------------------
// Start server
// -------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
