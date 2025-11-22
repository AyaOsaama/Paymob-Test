const express = require("express");
const { getToken, createOrder, createPaymentKey } = require("./paymob");
require("dotenv").config();

const app = express();
app.use(express.json());

app.post("/pay", async (req, res) => {
  try {
    const amount = req.body.amount; 

    
    const amountCents = amount * 100;

    
    const token = await getToken();

    
    const orderId = await createOrder(token, amountCents);

    
    const paymentToken = await createPaymentKey(
      token,
      orderId,
      amountCents
    );

    
    const iframeUrl = `https://accept.paymob.com/api/acceptance/iframes/${process.env.PAYMOB_IFRAME_ID}?payment_token=${paymentToken}`;

    res.json({ url: iframeUrl });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.listen(3000, () => console.log("Server running on http://localhost:3000"));
