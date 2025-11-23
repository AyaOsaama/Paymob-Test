const express = require("express");
const path = require("path");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();
const { getToken, createOrder, createPaymentKey } = require("./paymob");

const app = express();
app.use(cors());
app.use(express.json());

// Helper Functions
function readJSON(filePath) {
  return JSON.parse(require("fs").readFileSync(filePath, "utf-8"));
}

function extractBookIdFromItems(items) {
  const desc = items[0].description; // "Book ID: 3"
  return parseInt(desc.replace("Book ID: ", ""));
}

// Get PDF after payment (protected)
app.get("/books/:id/pdf", async (req, res) => {
  const bookId = parseInt(req.params.id);
  const orderId = req.query.accessKey; // استخدم orderId مباشرة

  try {
    const token = await getToken();
    const response = await axios.get(
      `https://accept.paymob.com/api/ecommerce/orders/${orderId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const order = response.data;

    if (!order.success) return res.status(403).json({ message: "يجب إتمام الدفع أولاً" });

    const booksPath = path.join(__dirname, "books/data.json");
    const books = readJSON(booksPath);
    const book = books.find((b) => b.id === bookId);
    if (!book) return res.status(404).json({ message: "الكتاب غير موجود" });

    const pdfPath = path.join(__dirname, "books/pdfs", book.pdf);
    res.sendFile(pdfPath);

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ message: "خطأ في التحقق من الدفع" });
  }
});

// Verify order
app.get("/verify/:orderId", async (req, res) => {
  const { orderId } = req.params;

  try {
    const token = await getToken();
    const response = await axios.get(
      `https://accept.paymob.com/api/ecommerce/orders/${orderId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const order = response.data;

    if (order.success) {
      return res.json({ status: "paid", accessKey: orderId });
    } else {
      return res.json({ status: "not paid" });
    }
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).json({ status: "error", message: "فشل التحقق من الدفع" });
  }
});

// Create payment
app.post("/pay", async (req, res) => {
  try {
    const { amount, bookId } = req.body;
    const token = await getToken();
    const orderId = await createOrder(token, amount * 100, bookId);
    const paymentToken = await createPaymentKey(token, orderId, amount * 100);

    const iframeUrl = `https://accept.paymob.com/api/acceptance/iframes/${process.env.PAYMOB_IFRAME_ID}?payment_token=${paymentToken}`;
    res.json({ url: iframeUrl, orderId });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "خطأ في إنشاء الدفع" });
  }
});

// Callback (optional)
app.post("/paymob/callback", (req, res) => {
  console.log("Paymob callback:", req.body);
  res.json({ status: "received" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
