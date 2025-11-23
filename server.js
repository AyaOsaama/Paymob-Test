const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();
const { getToken, createOrder, createPaymentKey } = require("./paymob");

const app = express();
app.use(cors());
app.use(express.json());

// ==============================
// Helper Functions
// ==============================
function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function extractBookIdFromItems(items) {
  const desc = items[0].description; // "Book ID: 3"
  return parseInt(desc.replace("Book ID: ", ""));
}

// ==============================
// 1) Books Routes
// ==============================

// Get all books
app.get("/books", (req, res) => {
  const booksPath = path.join(__dirname, "books/data.json");
  const books = readJSON(booksPath);
  res.json(books);
});

// Get single book by ID
app.get("/books/:id", (req, res) => {
  const booksPath = path.join(__dirname, "books/data.json");
  const books = readJSON(booksPath);
  const book = books.find((b) => b.id == req.params.id);
  if (!book) return res.status(404).json({ message: "Book not found" });
  res.json(book);
});

// Get PDF after payment (protected)
app.get("/books/:id/pdf", (req, res) => {
  const bookId = parseInt(req.params.id);
  const key = req.query.accessKey;
  const ordersPath = path.join(__dirname, "data/orders.json");
  const orders = readJSON(ordersPath);
  const paid = orders.find((o) => o.bookId === bookId && o.accessKey === key);
  if (!paid) return res.status(403).json({ message: "You must pay first" });

  const booksPath = path.join(__dirname, "books/data.json");
  const books = readJSON(booksPath);
  const book = books.find((b) => b.id == bookId);
  const pdfPath = path.join(__dirname, "books/pdfs", book.pdf);
  res.sendFile(pdfPath);
});

// ==============================
// 2) Paymob Routes
// ==============================

// Verify order after redirect
app.get("/verify/:orderId", async (req, res) => {
  const { orderId } = req.params;
  console.log("=== VERIFY START ===", orderId);
  try {
    const token = await getToken();
    console.log("Token:", token);

    const response = await axios.get(
      `https://accept.paymob.com/api/ecommerce/orders/${orderId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    console.log("Paymob response:", response.data);
    const order = response.data;

    if (order?.success && order?.id) {
      const bookId = extractBookIdFromItems(order.items);
      const accessKey = Math.random().toString(36).substring(2);

      const ordersPath = path.join(__dirname, "data/orders.json");
      const orders = readJSON(ordersPath);

      if (!orders.find(o => o.orderId === orderId)) {
        orders.push({ orderId, bookId, paid: true, accessKey });
        writeJSON(ordersPath, orders);
      }

      console.log("Order saved successfully");
      return res.json({ status: "paid", accessKey });
    } else {
      console.log("Order not paid yet");
      return res.json({ status: "not paid" });
    }
  } catch (err) {
    console.error("VERIFY ERROR:", err.response?.data || err.message);
    return res.status(500).json({ status: "error", message: "Verification failed" });
  }
});

// Create payment and get iframe
app.post("/pay", async (req, res) => {
  try {
    const { amount, bookId } = req.body;
    if (!amount || !bookId) return res.status(400).json({ error: "amount and bookId required" });

    const amountCents = amount * 100;
    const token = await getToken();
    const orderId = await createOrder(token, amountCents, bookId);
    const paymentToken = await createPaymentKey(token, orderId, amountCents);

    const iframeUrl = `https://accept.paymob.com/api/acceptance/iframes/${process.env.PAYMOB_IFRAME_ID}?payment_token=${paymentToken}`;
    res.json({ url: iframeUrl, orderId });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Callback from Paymob after payment success
app.post("/paymob/callback", (req, res) => {
  const data = req.body;
  console.log(data);

  if (data.obj?.success !== true) return res.json({ status: "payment failed" });

  const orderId = data.obj.order.id;
  const bookId = extractBookIdFromItems(data.obj.order.items);
  const accessKey = Math.random().toString(36).substring(2);

  const ordersPath = path.join(__dirname, "data/orders.json");
  const orders = readJSON(ordersPath);
  orders.push({ orderId, bookId, paid: true, accessKey });
  writeJSON(ordersPath, orders);

  res.json({ status: "payment saved" });
});

app.get("/paymob/callback", (req, res) => {
  console.log("Callback GET query:", req.query);
  // ممكن تحولي المستخدم مباشرة لصفحة الدفع الناجح
  res.redirect(`http://localhost:5174/payment-success?order_id=${req.query.order}`);
});

// ==============================
// 3) Start Server
// ==============================
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
