const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();
const { getToken, createOrder, createPaymentKey } = require("./paymob");

const app = express();
app.use(
  cors({
    origin: "https://books-front-paymob.vercel.app",
    methods: ["GET", "POST"],
    credentials: true
  })
);
app.use(express.json());

// Helper functions
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

// Books routes
app.get("/books", (req, res) => {
  const booksPath = path.join(__dirname, "books/data.json");
  res.json(readJSON(booksPath));
});

app.get("/books/:id", (req, res) => {
  const booksPath = path.join(__dirname, "books/data.json");
  const books = readJSON(booksPath);
  const book = books.find(b => b.id == req.params.id);
  if (!book) return res.status(404).json({ message: "Book not found" });
  res.json(book);
});

// Get PDF after payment (protected)
app.get("/books/:id/pdf", (req, res) => {
  const bookId = parseInt(req.params.id);
  const key = req.query.accessKey;

  const ordersPath = path.join(__dirname, "data/orders.json");
  const orders = readJSON(ordersPath);
  const paid = orders.find(o => o.bookId === bookId && o.accessKey === key);
  if (!paid) return res.status(403).json({ message: "You must pay first" });

  const booksPath = path.join(__dirname, "books/data.json");
  const book = readJSON(booksPath).find(b => b.id === bookId);
  if (!book) return res.status(404).json({ message: "Book not found" });

  const pdfPath = path.join(__dirname, "books/pdfs", book.pdf);
  res.sendFile(pdfPath);
});

// Paymob - Create payment
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

// Paymob callback POST
// POST callback (webhook)
app.post("/paymob/callback", (req, res) => {
  const data = req.body;
  console.log("Paymob POST callback:", data);

  if (!data?.success) return res.json({ status: "payment failed" });

  const orderId = data?.order?.id || data?.order;
  const bookId = extractBookIdFromItems(data.items || data.order.items);
  const accessKey = Math.random().toString(36).substring(2);

  const ordersPath = path.join(__dirname, "data/orders.json");
  const orders = fs.existsSync(ordersPath) ? JSON.parse(fs.readFileSync(ordersPath, "utf-8")) : [];

  if (!orders.find(o => o.orderId === orderId)) {
    orders.push({ orderId, bookId, paid: true, accessKey });
    fs.writeFileSync(ordersPath, JSON.stringify(orders, null, 2));
  }

  res.json({ status: "payment saved" });
});


// GET callback (redirect after payment)
app.get("/paymob/callback", (req, res) => {
  const orderId = req.query.order; // Paymob بيبعت order ID في query
  if (!orderId) return res.send("Order ID not found");

  // نقدر هنا نعمل redirect مباشر للصفحة الجاهزة على frontend
  res.redirect(`https://books-front-paymob.vercel.app/payment-success?success=true&order_id=${orderId}`);
});


// Verify payment
// Verify payment
app.get("/verify/:orderId", (req, res) => {
  try {
    const { orderId } = req.params;
    const ordersPath = path.join(__dirname, "/orders.json");

    if (!fs.existsSync(ordersPath)) {
      return res.json({ status: "not paid" });
    }

    const orders = JSON.parse(fs.readFileSync(ordersPath, "utf-8"));
    const order = orders.find(o => o.orderId == orderId);

    if (!order) return res.json({ status: "not paid" });

    res.json({ status: "paid", accessKey: order.accessKey, bookId: order.bookId });
  } catch (err) {
    console.error("Verify endpoint error:", err.message);
    res.status(500).json({ status: "error", message: "حدث خطأ في التحقق من الدفع" });
  }
});


// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
