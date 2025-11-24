const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const { getToken, createOrder, createPaymentKey } = require("./paymob");

require("dotenv").config();

const app = express();

// CORS setup
app.use(
  cors({
    origin: "https://books-front-paymob.vercel.app",
    methods: ["GET", "POST"],
    credentials: true,
  })
);

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // مهم للـ webhook
app.use(express.text({ type: "*/*" })); // في حالة البيانات مش JSON

// Helper functions
function readJSON(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function extractBookIdFromItems(items) {
  const desc = items[0]?.description || "";
  return parseInt(desc.replace("Book ID: ", ""));
}

// Paths
const ordersPath = path.join(__dirname, "orders.json");
const booksPath = path.join(__dirname, "books/data.json");

// ------------------ Books routes ------------------
app.get("/books", (req, res) => {
  res.json(readJSON(booksPath));
});

app.get("/books/:id", (req, res) => {
  const books = readJSON(booksPath);
  const book = books.find((b) => b.id == req.params.id);
  if (!book) return res.status(404).json({ message: "Book not found" });
  res.json(book);
});

// Get PDF after payment
app.get("/books/:id/pdf", (req, res) => {
  const bookId = parseInt(req.params.id);
  const key = req.query.accessKey;

  const orders = readJSON(ordersPath);
  const paid = orders.find((o) => o.bookId === bookId && o.accessKey === key);
  if (!paid) return res.status(403).json({ message: "You must pay first" });

  const book = readJSON(booksPath).find((b) => b.id === bookId);
  if (!book) return res.status(404).json({ message: "Book not found" });

  const pdfPath = path.join(__dirname, "books/pdfs", book.pdf);
  res.sendFile(pdfPath);
});

// ------------------ Paymob payment ------------------
app.post("/pay", async (req, res) => {
  try {
    const { amount, bookId } = req.body;
    if (!amount || !bookId)
      return res.status(400).json({ error: "amount and bookId required" });

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

// ------------------ Paymob callback ------------------
app.post("/paymob/callback", (req, res) => {
  let data;
 console.log("🔥 Headers:", req.headers);
  console.log("🔥 Body raw:", req.body);
  res.status(200).send("Received");
  // حاول تقرأ البيانات كـ JSON أو text
  try {
    if (typeof req.body === "string") {
      data = JSON.parse(req.body);
    } else {
      data = req.body;
    }
  } catch (err) {
    console.error("Failed to parse callback body:", req.body);
    return res.status(400).send("Invalid callback data");
  }

  console.log("✅ Paymob POST callback received:", data);

  if (!data?.success) {
    return res.json({ status: "payment failed" });
  }

  const orderId = data?.order?.id || data?.order;
  const bookId = extractBookIdFromItems(data.items || data.order?.items);
  const accessKey = Math.random().toString(36).substring(2, 10);

  // قراءة وتحديث orders.json
  const orders = readJSON(ordersPath);
  if (!orders.find((o) => o.orderId === orderId)) {
    orders.push({ orderId, bookId, paid: true, accessKey });
    writeJSON(ordersPath, orders);
    console.log("✅ Order saved to orders.json:", { orderId, bookId });
  } else {
    console.log("⚠️ Order already exists:", orderId);
  }

  res.json({ status: "payment saved" });
});

// GET callback (redirect after payment)
app.get("/paymob/callback", (req, res) => {
  const orderId = req.query.order;
  if (!orderId) return res.send("Order ID not found");

  res.redirect(
    `https://books-front-paymob.vercel.app/payment-success?success=true&order_id=${orderId}`
  );
});

// Verify payment
app.get("/verify/:orderId", (req, res) => {
  const { orderId } = req.params;
  const orders = readJSON(ordersPath);
  const order = orders.find((o) => o.orderId == orderId);

  if (!order) return res.json({ status: "not paid" });

  res.json({
    status: "paid",
    accessKey: order.accessKey,
    bookId: order.bookId,
  });
});

// ------------------ Start server ------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}...`));
