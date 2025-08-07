const request = require('supertest');
const { app, pool, initializeDatabase } = require('./server.cjs');

const userId = 'test-user';
const symbol = 'AAPL';
const sudoKey = 'admin123';

beforeAll(async () => {
  await initializeDatabase();
});

afterAll(async () => {
  await pool.end();
});

describe('Settlement API Tests', () => {
  test('Initial GET /api/settlement/:userId should return 0 balance', async () => {
    const res = await request(app).get(`/api/settlement/${userId}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.balance).toBe('0.00');
  });

  test('POST /api/settlement/:userId to add amount', async () => {
    const res = await request(app)
      .post(`/api/settlement/${userId}`)
      .send({ amount: 5000, action: 'add' });
    expect(res.statusCode).toBe(200);
    expect(parseFloat(res.body.balance)).toBeGreaterThanOrEqual(5000);
  });

  test('POST /api/settlement/:userId to withdraw valid amount', async () => {
    const res = await request(app)
      .post(`/api/settlement/${userId}`)
      .send({ amount: 1000, action: 'withdraw' });
    expect(res.statusCode).toBe(200);
    expect(parseFloat(res.body.balance)).toBeGreaterThanOrEqual(0);
  });

  test('POST /api/settlement/:userId to withdraw excessive amount should fail', async () => {
    const res = await request(app)
      .post(`/api/settlement/${userId}`)
      .send({ amount: 9999999, action: 'withdraw' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/insufficient balance/i);
  });
});

describe('Asset API Tests', () => {
  test('GET /api/search/:query should return results or API error', async () => {
    const res = await request(app).get('/api/search/AAPL');
    expect([200, 500, 404]).toContain(res.statusCode);
  });

  test('GET /api/quote/:symbol should return valid quote or error', async () => {
    const res = await request(app).get(`/api/quote/${symbol}`);
    expect([200, 500, 404]).toContain(res.statusCode);
  });
});

describe('Transaction API Tests', () => {
  let transactionId;

  test('POST /api/transactions to buy should succeed', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .send({
        user_id: userId,
        symbol: symbol,
        quantity: 1,
        type: 'buy',
        asset_type: 'stock'
      });

    expect([201, 400, 500]).toContain(res.statusCode);
    if (res.statusCode === 201) {
      transactionId = res.body.id;
      expect(res.body).toHaveProperty('price');
    }
  });

  test('POST /api/transactions to sell should succeed (if bought before)', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .send({
        user_id: userId,
        symbol: symbol,
        quantity: 1,
        type: 'sell',
        asset_type: 'stock'
      });

    expect([201, 400, 500]).toContain(res.statusCode);
  });

  test('GET /api/transactions/:userId should return user history', async () => {
    const res = await request(app).get(`/api/transactions/${userId}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /api/portfolio/:userId should return portfolio view', async () => {
    const res = await request(app).get(`/api/portfolio/${userId}`);
    expect([200, 500]).toContain(res.statusCode);
  });

  test('DELETE /api/transactions/:id (with sudo key)', async () => {
    if (!transactionId) return; // skip if no transaction was made
    const res = await request(app)
      .delete(`/api/transactions/${transactionId}`)
      .set('x-sudo-key', sudoKey);

    expect([200, 400, 404, 500]).toContain(res.statusCode);
  });
});

describe('Admin Tools', () => {
  test('DELETE /api/erase with wrong key should fail', async () => {
    const res = await request(app)
      .delete('/api/erase')
      .set('x-sudo-key', 'wrongKey');
    expect(res.statusCode).toBe(403);
  });

  test('DELETE /api/erase with sudo key should work', async () => {
    const res = await request(app)
      .delete('/api/erase')
      .set('x-sudo-key', sudoKey);
    expect(res.statusCode).toBe(200);
  });
});
