// server.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const { getToken, createOrder, createPaymentKey } = require("./paymob");

const app = express();
app.use(cors());
app.use(express.json());

const ordersPath = path.join(__dirname, "/orders.json");
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

// app.post("/pay-test", (req, res) => {
//   const { amount, bookId } = req.body;

//   const orderId = Math.floor(Math.random() * 1000000000); // رقم طلب وهمي
//   const accessKey = Math.random().toString(36).substring(2);

//   const orders = readJSON(ordersPath);
//   orders.push({ orderId, bookId, paid: true, accessKey });
//   writeJSON(ordersPath, orders);

//   res.json({ status: "paid", orderId, bookId, accessKey });
// });

app.post("/pay-test", (req, res) => {
  const { bookId } = req.body;

  // accessKey ثابت للتجربة
  const accessKey = Math.random().toString(36).substring(2);

  // بدلاً من orders.json، نحتفظ بالبيانات مؤقتًا في memory
  const paidBook = { bookId, accessKey };

  res.json({ status: "paid", bookId, accessKey });
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

    const iframeUrl = `https://accept.paymobsolutions.com/api/acceptance/iframes/${process.env.PAYMOB_IFRAME_ID}?payment_token=${paymentToken}`;

    res.json({ url: iframeUrl, orderId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "حدث خطأ في الدفع" });
  }
});

// -------------------------
// Verify route
app.get("/verify/:orderId", (req, res) => {
  const { orderId } = req.params;
  const orders = readJSON(ordersPath);
  const order = orders.find(o => o.orderId == orderId);

  if (!order) return res.json({ status: "not paid" });
  return res.json({ status: "paid", bookId: order.bookId, accessKey: order.accessKey });
});

// -------------------------
// Paymob callback
// app.post("/paymob/callback", (req, res) => {
//   const data = req.body;
//   if (!data.obj?.success) return res.json({ status: "payment failed" });

//   const orderId = data.obj.order.id;
//   const bookId = extractBookIdFromItems(data.obj.order.items);
//   const accessKey = Math.random().toString(36).substring(2);

//   const orders = readJSON(ordersPath);
//   if (!orders.find(o => o.orderId === orderId)) {
//     orders.push({ orderId, bookId, paid: true, accessKey });
//     writeJSON(ordersPath, orders);
//   }

//   res.json({ status: "payment saved" });
// });

// GET route للـ callback من Paymob للعرض في المتصفح
app.get("/paymob/callback", (req, res) => {
  const orderId = req.query.order; // الرقم اللي بيجي من Paymob
  const orders = readJSON(ordersPath);
  const order = orders.find(o => o.orderId == orderId);

  if (!order) {
    return res.send("<h1>Payment not found or failed!</h1>");
  }

  res.send(`
    <h1>Payment Success!</h1>
    <p>تم الدفع بنجاح للكتاب رقم: ${order.bookId}</p>
    <a href="/books/${order.bookId}/pdf?accessKey=${order.accessKey}" target="_blank">
      افتح الكتاب الآن
    </a>
  `);
});

// Start server
app.listen(5000, () => console.log("Server running on http://localhost:5000"));
