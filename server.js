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
app.post("/paymob/callback", (req, res) => {
  const data = req.body;
  console.log("Paymob POST callback:", data);

  if (!data?.success) return res.json({ status: "payment failed" });

  const orderId = data?.order?.id || data?.order;
  const bookId = extractBookIdFromItems(data.items || data.order.items);
  const accessKey = Math.random().toString(36).substring(2);

  const ordersPath = path.join(__dirname, "data/orders.json");
  const orders = readJSON(ordersPath);
  if (!orders.find(o => o.orderId === orderId)) {
    orders.push({ orderId, bookId, paid: true, accessKey });
    writeJSON(ordersPath, orders);
  }

  res.status(200).json({ status: "payment received" });
});

// Verify payment
app.get("/verify/:orderId", async (req, res) => {
  const { orderId } = req.params;
  const ordersPath = path.join(__dirname, "data/orders.json");
  const orders = readJSON(ordersPath);
  const order = orders.find(o => o.orderId == orderId);

  if (!order) return res.json({ status: "not paid" });
  res.json({ status: "paid", accessKey: order.accessKey });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
