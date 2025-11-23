// server.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const { getToken, createOrder, createPaymentKey } = require("./paymob");

require("dotenv").config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // لتلقي requests بصيغ مختلفة

// ملفات البيانات
const ordersPath = path.join(__dirname, "/orders.json");
if (!fs.existsSync(ordersPath)) fs.writeFileSync(ordersPath, "[]");

// Helpers
function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function extractBookIdFromItems(items) {
  return parseInt(items[0].description.replace("Book ID: ", ""));
}

// -------------------------
// Books routes
// -------------------------

// عرض كل الكتب
app.get("/books", (req, res) => {
  const booksPath = path.join(__dirname, "books/data.json");
  const books = readJSON(booksPath);
  res.json(books);
});

// تحميل PDF بعد الدفع
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
// Pay route
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

    // رابط iframe
    const iframeUrl = `https://accept.paymobsolutions.com/api/acceptance/iframes/${process.env.PAYMOB_IFRAME_ID}?payment_token=${paymentToken}`;

    res.json({ url: iframeUrl, orderId });
  } catch (err) {
    console.error(err.response?.data || err.message);
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
// Paymob callback
// -------------------------

app.post("/paymob/callback", (req, res) => {
  const data = req.body;

  if (!data.obj?.success) return res.json({ status: "payment failed" });

  const orderId = data.obj.order.id;
  const bookId = extractBookIdFromItems(data.obj.order.items);
  const accessKey = Math.random().toString(36).substring(2);

  const orders = readJSON(ordersPath);
  if (!orders.find(o => o.orderId === orderId)) {
    orders.push({ orderId, bookId, paid: true, accessKey });
    writeJSON(ordersPath, orders);
  }

  res.json({ status: "payment saved" });
});

// -------------------------
// Start server
// -------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
