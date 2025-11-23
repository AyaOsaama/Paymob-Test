// server.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const { getToken, createOrder, createPaymentKey } = require("./paymob");

const app = express();
app.use(cors());
app.use(express.json());

const ordersPath = path.join(__dirname, "orders.json");
if (!fs.existsSync(ordersPath)) fs.writeFileSync(ordersPath, "[]");

// -------------------------
// Helper functions
// -------------------------
function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}
function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// -------------------------
// Books routes
// -------------------------
app.get("/books", (req, res) => {
  const booksPath = path.join(__dirname, "books/data.json");
  const books = readJSON(booksPath);
  res.json(books);
});

app.get("/books/:id/pdf", (req, res) => {
  const bookId = parseInt(req.params.id);
  const key = req.query.accessKey;

  const orders = readJSON(ordersPath);
  const paid = orders.find(o => o.bookId === bookId && o.accessKey === key);
  if (!paid) return res.status(403).json({ message: "You must pay first" });

  const booksPath = path.join(__dirname, "books/data.json");
  const books = readJSON(booksPath);
  const book = books.find(b => b.id === bookId);

  const pdfPath = path.join(__dirname, "books/pdfs", book.pdf);
  res.sendFile(pdfPath);
});

// -------------------------
// Pay-test route (عرض نجاح مباشر)
// -------------------------
app.post("/pay-test", (req, res) => {
  const { bookId } = req.body;

  const orderId = Math.floor(Math.random() * 1000000000);
  const accessKey = Math.random().toString(36).substring(2);

  const orders = readJSON(ordersPath);
  orders.push({ orderId, bookId, paid: true, accessKey });
  writeJSON(ordersPath, orders);

  // إرجاع orderId و accessKey عشان صفحة success تستخدمها
  res.json({ status: "paid", orderId, bookId, accessKey });
});

// -------------------------
// Pay route (باستخدام Paymob)
app.post("/pay", async (req, res) => {
  try {
    const { amount, bookId } = req.body;
    const amountCents = amount * 100;

    const token = await getToken();
    const orderId = await createOrder(token, amountCents, bookId);
    const paymentToken = await createPaymentKey(token, orderId, amountCents);

    // هنا خلي return_url يروح على صفحة success مستقلة
    const iframeUrl = `https://accept.paymobsolutions.com/api/acceptance/iframes/${process.env.PAYMOB_IFRAME_ID}?payment_token=${paymentToken}&return_url=https://paymob-test-ten.vercel.app/payment-success?order_id=${orderId}`;

    res.json({ url: iframeUrl, orderId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "حدث خطأ في الدفع" });
  }
});

// -------------------------
// Verify route
// -------------------------
app.get("/verify/:orderId", (req, res) => {
  const { orderId } = req.params;
  const orders = readJSON(ordersPath);
  const order = orders.find(o => o.orderId == orderId);

  if (!order) return res.json({ status: "not paid" });
  return res.json({ status: "paid", bookId: order.bookId, accessKey: order.accessKey });
});

// -------------------------
// Start server
// -------------------------
app.listen(5000, () => console.log("Server running on http://localhost:5000"));
