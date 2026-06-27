require('dotenv').config();
const express = require('express');
const { Client, Environment } = require('square');
const { randomUUID } = require('crypto');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const client = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: process.env.SQUARE_ENVIRONMENT === 'production'
    ? Environment.Production
    : Environment.Sandbox,
});

const NIGHTLY_RATE = 2000;
const WEEKLY_RATE  = 9500;
const MONTHLY_RATE = 27500;

function calculatePrice(stayType, nights) {
  if (stayType === 'month') return { amount: MONTHLY_RATE, label: '1 Month Stay' };
  if (stayType === 'week')  return { amount: WEEKLY_RATE,  label: '1 Week Stay (7 nights)' };
  const n = parseInt(nights) || 1;
  return { amount: NIGHTLY_RATE * n, label: `${n} Night${n > 1 ? 's' : ''} @ $20/night` };
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/create-payment-link', async (req, res) => {
  const { name, email, phone, company, plate, stayType, nights } = req.body;

  if (!name || !email || !phone || !plate || !stayType) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const { amount, label } = calculatePrice(stayType, nights);

  try {
    const response = await client.checkoutApi.createPaymentLink({
      idempotencyKey: randomUUID(),
      order: {
        locationId: process.env.SQUARE_LOCATION_ID,
        lineItems: [
          {
            name: `Warehouse Lot Parking — ${label}`,
            note: `Driver: ${name} | Phone: ${phone} | Plate: ${plate}${company ? ' | Company: ' + company : ''}`,
            quantity: '1',
            basePriceMoney: {
              amount: BigInt(amount),
              currency: 'USD',
            },
          },
        ],
      },
      prePopulatedData: {
        buyerEmail: email,
      },
      checkoutOptions: {
        redirectUrl: `${process.env.BASE_URL}/success`,
        askForShippingAddress: false,
      },
    });

    const url = response.result.paymentLink.url;
    res.json({ url });
  } catch (err) {
    console.error('Square error:', err);
    res.status(500).json({ error: 'Payment session could not be created. Please try again.' });
  }
});

app.get('/success', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'success.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));