const axios = require("axios");
require("dotenv").config();

// 1) Get Auth Token
async function getToken() {
  const res = await axios.post(
    "https://accept.paymob.com/api/auth/tokens",
    {
      api_key: process.env.PAYMOB_API_KEY,
    }
  );
  return res.data.token;
}

// 2) Create Order
async function createOrder(token, amountCents) {
  const res = await axios.post(
    "https://accept.paymob.com/api/ecommerce/orders",
    {
      auth_token: token,
      amount_cents: amountCents,
      currency: "EGP",
      items: [],
    }
  );
  return res.data.id; 
}

// 3) Create Payment Key
async function createPaymentKey(token, orderId, amountCents) {
  const res = await axios.post(
    "https://accept.paymob.com/api/acceptance/payment_keys",
    {
      auth_token: token,
      amount_cents: amountCents,
      expiration: 3600,
      order_id: orderId,
       currency: "EGP", 
      billing_data: {
        apartment: "NA",
        email: "test@test.com",
        floor: "NA",
        first_name: "Aya",
        last_name: "User",
        street: "Test",
        building: "NA",
        phone_number: "0111111111",
        shipping_method: "PKG",
        postal_code: "12345",
        city: "Cairo",
        country: "EG",
        state: "NA",
      },
      integration_id: process.env.PAYMOB_INTEGRATION_ID,
    }
  );

  return res.data.token; 
}

module.exports = { getToken, createOrder, createPaymentKey };
