// server.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const { getToken, createOrder, createPaymentKey } = require("./paymob");

const app = express();
app.use(cors());
app.use(express.json());

// -----------------------------------
// Orders JSON
// -----------------------------------
const ordersPath = path.join(__dirname, "orders.json");
if (!fs.existsSync(ordersPath)) fs.writeFileSync(ordersPath, "[]");

// Helper functions
function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}
function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}
function extractBookIdFromItems(items) {
  return parseInt(items[0].description.replace("Book ID: ", ""));
}

// -----------------------------------
// Books routes
// -----------------------------------
app.get("/books", (req, res) => {
  const booksPath = path.join(__dirname, "books/data.json");
  const books = readJSON(booksPath);
  res.json(books);
});

// فتح PDF بعد الدفع والتحقق من accessKey
app.get("/books/:id/pdf", (req, res) => {
  const bookId = parseInt(req.params.id);
  const key = req.query.accessKey;

  const orders = readJSON(ordersPath);
  const paid = orders.find(o => o.bookId === bookId && o.accessKey === key);
  if (!paid) return res.status(403).json({ message: "يجب دفع ثمن الكتاب أولاً" });

  const booksPath = path.join(__dirname, "books/data.json");
  const books = readJSON(booksPath);
  const book = books.find(b => b.id === bookId);

  if (!book) return res.status(404).json({ message: "الكتاب غير موجود" });

  const pdfPath = path.join(__dirname, "books/pdfs", book.pdf);
  res.sendFile(pdfPath);
});

// -----------------------------------
// Pay route (Paymob)
// -----------------------------------
app.post("/pay", async (req, res) => {
  try {
    const { amount, bookId } = req.body;
    const amountCents = amount * 100;

    const token = await getToken();
    const orderId = await createOrder(token, amountCents, bookId);
    const paymentToken = await createPaymentKey(token, orderId, amountCents);

    const iframeUrl = `https://accept.paymobsolutions.com/api/acceptance/iframes/${process.env.PAYMOB_IFRAME_ID}?payment_token=${paymentToken}`;

    res.json({ url: iframeUrl, orderId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "حدث خطأ في الدفع" });
  }
});

// -----------------------------------
// Verify route
// -----------------------------------
app.get("/verify/:orderId", (req, res) => {
  const { orderId } = req.params;
  const orders = readJSON(ordersPath);
  const order = orders.find(o => o.orderId == orderId);

  if (!order) return res.json({ status: "not paid" });
  return res.json({ status: "paid", bookId: order.bookId, accessKey: order.accessKey });
});

// -----------------------------------
// Paymob callback
// -----------------------------------
app.post("/paymob/callback", (req, res) => {
  const data = req.body;

  if (!data.obj?.success) return res.status(400).json({ status: "payment failed" });

  const orderId = data.obj.order.id;
  const bookId = extractBookIdFromItems(data.obj.order.items);
  const accessKey = Math.random().toString(36).substring(2);

  const orders = readJSON(ordersPath);
  if (!orders.find(o => o.orderId === orderId)) {
    orders.push({ orderId, bookId, paid: true, accessKey });
    writeJSON(ordersPath, orders);
  }

  // Paymob مش محتاج يشوف response HTML، بس ممكن نرجع OK
  res.json({ status: "payment saved" });
});
const paidBooks = [];

app.get("/paymob/callback", (req, res) => {
  const orderId = req.query.order;
  const bookId = parseInt(req.query.bookId || 0);
  const accessKey = Math.random().toString(36).substring(2);

  if (!paidBooks.find(o => o.orderId === orderId)) {
    paidBooks.push({ orderId, bookId, paid: true, accessKey });
  }

  console.log("Paid books:", paidBooks);
  res.send("Payment received!");
});


// -----------------------------------
// Start server
// -----------------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
