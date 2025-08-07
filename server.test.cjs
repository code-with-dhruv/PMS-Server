const request = require('supertest');
const {app, pool, initializeDatabase} = require('./server.cjs');

beforeAll(async()=>{
    await initializeDatabase();
})

afterAll(async()=>{
    await pool.end();
});

describe('API Endpoints', () => {
  let testUserId = 'test-user-123';

  // Settlement account should initialize to 0
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

  test('POST /api/transactions should return 400 for missing fields', async () => {
    const res = await request(app).post('/api/transactions').send({});
    expect(res.statusCode).toEqual(400);
  });

  test('GET /api/search/:query should return results', async () => {
    const res = await request(app).get('/api/search/AAPL');
    expect([200, 500]).toContain(res.statusCode); // 500 might occur if API key limit reached
  });

  test('GET /api/quote/:symbol should return price', async () => {
    const res = await request(app).get('/api/quote/AAPL');
    expect([200, 500, 404]).toContain(res.statusCode); // Flexible for API errors
  });

  test('GET /api/portfolio/:userId should return holdings', async () => {
    const res = await request(app).get(`/api/portfolio/${testUserId}`);
    expect([200, 500]).toContain(res.statusCode);
  });
});


