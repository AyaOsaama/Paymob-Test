// server.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// Orders file
const ordersPath = path.join(__dirname, "orders.json");

// إنشاء orders.json لو مش موجود
if (!fs.existsSync(ordersPath)) fs.writeFileSync(ordersPath, "[]");

// -------------------------
// Helper functions
// -------------------------
function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (err) {
    return [];
  }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// -------------------------
// Books routes
// -------------------------
app.get("/books", (req, res) => {
  try {
    const booksPath = path.join(__dirname, "books/data.json");
    const books = readJSON(booksPath);
    res.json(books);
  } catch (err) {
    res.status(500).json({ error: "خطأ في جلب الكتب" });
  }
});

app.get("/books/:id/pdf", (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ error: "حدث خطأ أثناء تحميل الكتاب" });
  }
});

// -------------------------
// Pay-test route (نجاح مباشر)
// -------------------------
app.post("/pay-test", (req, res) => {
  try {
    const { bookId } = req.body;

    if (!bookId) return res.status(400).json({ error: "رقم الكتاب مطلوب" });

    // إنشاء رقم طلب و accessKey عشوائي
    const orderId = Math.floor(Math.random() * 1000000000);
    const accessKey = Math.random().toString(36).substring(2);

    // حفظ الطلب في orders.json
    const orders = readJSON(ordersPath);
    orders.push({ orderId, bookId, paid: true, accessKey });
    writeJSON(ordersPath, orders);

    // إرجاع نتيجة الدفع مباشرة
    res.json({
      status: "paid",
      orderId,
      bookId,
      accessKey,
      message: "تم الدفع بنجاح!"
    });
  } catch (err) {
    res.status(500).json({ error: "حدث خطأ أثناء معالجة الدفع" });
  }
});

// -------------------------
// Verify route
// -------------------------
app.get("/verify/:orderId", (req, res) => {
  try {
    const { orderId } = req.params;
    const orders = readJSON(ordersPath);
    const order = orders.find(o => o.orderId == orderId);

    if (!order) return res.json({ status: "not paid" });
    return res.json({ status: "paid", bookId: order.bookId, accessKey: order.accessKey });
  } catch (err) {
    res.status(500).json({ error: "خطأ أثناء التحقق من الدفع" });
  }
});

// -------------------------
// Start server
// -------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
