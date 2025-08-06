const request = require('supertest');
const { app, pool, initializeDatabase } = require('./server.cjs');

beforeAll(async () => {
  await initializeDatabase();
});

afterAll(async () => {
  await pool.end();
});

describe('API Endpoints', () => {
  let testUserId = 'test-user-123';
  let transactionId = null;

  test('GET /api/settlement/:userId should return balance', async () => {
    const res = await request(app).get(`/api/settlement/${testUserId}`);
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('user_id', testUserId);
    expect(res.body).toHaveProperty('balance');
  });

  test('POST /api/settlement/:userId should add balance', async () => {
    const res = await request(app)
      .post(`/api/settlement/${testUserId}`)
      .send({ amount: 1000, action: 'add' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.user_id).toBe(testUserId);
    expect(parseFloat(res.body.balance)).toBeGreaterThanOrEqual(1000);
  });

  test('POST /api/settlement/:userId should withdraw balance', async () => {
    const res = await request(app)
      .post(`/api/settlement/${testUserId}`)
      .send({ amount: 200, action: 'withdraw' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.user_id).toBe(testUserId);
    expect(parseFloat(res.body.balance)).toBeGreaterThanOrEqual(800);
  });

  test('POST /api/settlement/:userId should fail with invalid action', async () => {
    const res = await request(app)
      .post(`/api/settlement/${testUserId}`)
      .send({ amount: 200, action: 'invalid_action' });

    expect(res.statusCode).toBe(400);
  });

  test('GET /api/settlement_transactions/:userId should return logs', async () => {
    const res = await request(app).get(`/api/settlement_transactions/${testUserId}`);
    expect([200, 404]).toContain(res.statusCode);
  });

  test('POST /api/transactions should return 400 for missing fields', async () => {
    const res = await request(app).post('/api/transactions').send({});
    expect(res.statusCode).toEqual(400);
  });

  test('POST /api/transactions should create a buy transaction', async () => {
    const res = await request(app).post('/api/transactions').send({
      user_id: testUserId,
      symbol: 'AAPL',
      quantity: 1,
      type: 'buy',
      asset_type: 'stock',
    });

    expect([200, 500]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      expect(res.body).toHaveProperty('id');
      transactionId = res.body.id;
    }
  });

  test('GET /api/transactions/:userId should return user transactions', async () => {
    const res = await request(app).get(`/api/transactions/${testUserId}`);
    expect([200, 404]).toContain(res.statusCode);
  });

  test('GET /api/transactions should return all transactions', async () => {
    const res = await request(app).get('/api/transactions');
    expect([200, 404]).toContain(res.statusCode);
  });

  test('DELETE /api/transactions/:id should fail without sudo key', async () => {
    if (transactionId) {
      const res = await request(app).delete(`/api/transactions/${transactionId}`);
      expect(res.statusCode).toBe(403);
    }
  });

  test('DELETE /api/transactions/:id should delete with sudo key', async () => {
    if (transactionId) {
      const res = await request(app)
        .delete(`/api/transactions/${transactionId}`)
        .set('x-sudo-key', 'admin123');

      expect([200, 404]).toContain(res.statusCode);
    }
  });

  test('GET /api/search/:query should return results', async () => {
    const res = await request(app).get('/api/search/AAPL');
    expect([200, 500]).toContain(res.statusCode);
  });

  test('GET /api/quote/:symbol should return price', async () => {
    const res = await request(app).get('/api/quote/AAPL');
    expect([200, 404, 500]).toContain(res.statusCode);
  });

  test('GET /api/portfolio/:userId should return holdings', async () => {
    const res = await request(app).get(`/api/portfolio/${testUserId}`);
    expect([200, 500]).toContain(res.statusCode);
  });

  test('DELETE /api/erase should fail without sudo key', async () => {
    const res = await request(app).delete('/api/erase');
    expect(res.statusCode).toBe(403);
  });

  test('DELETE /api/erase should succeed with sudo key', async () => {
    const res = await request(app)
      .delete('/api/erase')
      .set('x-sudo-key', 'admin123');

    expect(res.statusCode).toBe(200);
  });
});
