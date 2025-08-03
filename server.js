const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();
const BASE_URL = 'https://api.twelvedata.com';
const API_KEY = process.env.TWELVE_DATA_API_KEY || '6b4a261335974ce2865386d858dbe6ff';

const app = express();
app.use(cors());
app.use(bodyParser.json());

// MySQL connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Test pool connection
pool.getConnection((err, connection) => {
  if (err) {
    console.error('Database connection failed:', err.message);
    process.exit(1);
  }
  console.log('Database connected successfully');
  connection.release();
});

// Initialize database tables
async function initializeDatabase() {
  try {
    const connection = await pool.getConnection();
    await connection.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        symbol VARCHAR(50) NOT NULL,
        quantity INT NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        type ENUM('buy', 'sell') NOT NULL,
        asset_type ENUM('stock', 'bond', 'mutual_fund') NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await connection.query(`
      CREATE TABLE IF NOT EXISTS settlement_accounts (
        user_id VARCHAR(255) PRIMARY KEY,
        balance DECIMAL(15,2) NOT NULL DEFAULT 0.00
      )
    `);
    connection.release();
    console.log('Database tables initialized');
  } catch (error) {
    console.error('Error initializing database:', error.message);
  }
}
initializeDatabase();

// GET: Search stocks, bonds, mutual funds using Twelve Data API
app.get('/api/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const response = await axios.get(`${BASE_URL}/symbol_search?symbol=${query}&apikey=${API_KEY}`);
    if (response.data.status === 'error') {
      return res.status(404).json({ error: response.data.message });
    }
    res.json(response.data.data.map(item => ({
      symbol: item.symbol,
      name: item.instrument_name,
      type: item.instrument_type.toLowerCase(),
      exchange: item.exchange,
      currency: item.currency
    })));
  } catch (error) {
    console.error('Error searching assets:', error.message);
    res.status(500).json({ error: 'Failed to search assets' });
  }
});

// GET: Fetch real-time stock quote from Twelve Data
app.get('/api/quote/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const response = await axios.get(`${BASE_URL}/quote?symbol=${symbol}&apikey=${API_KEY}`);
    if (response.data.status === 'error') {
      return res.status(404).json({ error: response.data.message });
    }
    res.json({
      symbol: response.data.symbol,
      price: response.data.close,
      name: response.data.name,
      currency: response.data.currency
    });
  } catch (error) {
    console.error('Error fetching quote:', error.message);
    res.status(500).json({ error: 'Failed to fetch quote' });
  }
});

// POST: Create a buy/sell transaction with real-time price
app.post('/api/transactions', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { user_id, symbol, quantity, type, asset_type } = req.body;
    if (!user_id || !symbol || !quantity || !type || !asset_type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (quantity <= 0) {
      return res.status(400).json({ error: 'Invalid quantity' });
    }
    if (!['stock', 'bond', 'mutual_fund'].includes(asset_type)) {
      return res.status(400).json({ error: 'Invalid asset type' });
    }

    // Fetch real-time price
    const response = await axios.get(`${BASE_URL}/quote?symbol=${symbol}&apikey=${API_KEY}`);
    if (response.data.status === 'error') {
      await connection.rollback();
      return res.status(404).json({ error: response.data.message });
    }
    const price = response.data.close;

    // Check settlement account balance for buy transactions
    if (type === 'buy') {
      const [rows] = await connection.query('SELECT balance FROM settlement_accounts WHERE user_id = ?', [user_id]);
      const balance = rows[0]?.balance || 0;
      const totalCost = quantity * price;
      if (balance < totalCost) {
        await connection.rollback();
        return res.status(400).json({ error: 'Insufficient balance' });
      }
      await connection.query('UPDATE settlement_accounts SET balance = balance - ? WHERE user_id = ?', [totalCost, user_id]);
    } else if (type === 'sell') {
      // Check holdings
      const [holdings] = await connection.query(
        'SELECT SUM(CASE WHEN type = "buy" THEN quantity ELSE -quantity END) as total_quantity ' +
        'FROM transactions WHERE user_id = ? AND symbol = ? AND asset_type = ?',
        [user_id, symbol, asset_type]
      );
      const totalQuantity = holdings[0]?.total_quantity || 0;
      if (totalQuantity < quantity) {
        await connection.rollback();
        return res.status(400).json({ error: 'Insufficient holdings' });
      }
      await connection.query('UPDATE settlement_accounts SET balance = balance + ? WHERE user_id = ?', [quantity * price, user_id]);
    }

    // Insert transaction
    const [result] = await connection.query(
      'INSERT INTO transactions (user_id, symbol, quantity, price, type, asset_type) VALUES (?, ?, ?, ?, ?, ?)',
      [user_id, symbol, quantity, price, type, asset_type]
    );
    await connection.commit();
    res.status(201).json({ id: result.insertId, user_id, symbol, quantity, price, type, asset_type, timestamp: new Date() });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating transaction:', error.message);
    res.status(500).json({ error: 'Failed to create transaction' });
  } finally {
    connection.release();
  }
});

// GET: Retrieve portfolio holdings with diversification percentages
app.get('/api/portfolio/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const [holdings] = await pool.query(
      'SELECT symbol, asset_type, SUM(CASE WHEN type = "buy" THEN quantity ELSE -quantity END) as total_quantity ' +
      'FROM transactions WHERE user_id = ? GROUP BY symbol, asset_type HAVING total_quantity > 0',
      [userId]
    );

    let totalValue = 0;
    const portfolio = await Promise.all(holdings.map(async (holding) => {
      const response = await axios.get(`${BASE_URL}/quote?symbol=${holding.symbol}&apikey=${API_KEY}`);
      if (response.data.status === 'error') return null;
      const value = holding.total_quantity * response.data.close;
      totalValue += value;
      return {
        symbol: holding.symbol,
        asset_type: holding.asset_type,
        quantity: holding.total_quantity,
        price: response.data.close,
        value
      };
    }));

    const validPortfolio = portfolio.filter(item => item);
    const diversification = {
      stock: 0,
      bond: 0,
      mutual_fund: 0
    };

    validPortfolio.forEach(item => {
      diversification[item.asset_type] += (item.value / totalValue) * 100;
    });

    res.json({
      holdings: validPortfolio,
      diversification: {
        stocks: diversification.stock.toFixed(2) + '%',
        bonds: diversification.bond.toFixed(2) + '%',
        mutual_funds: diversification.mutual_fund.toFixed(2) + '%'
      },
      total_value: totalValue.toFixed(2)
    });
  } catch (error) {
    console.error('Error fetching portfolio:', error.message);
    res.status(500).json({ error: 'Failed to fetch portfolio' });
  }
});

// GET: Retrieve all transactions
app.get('/api/transactions', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM transactions ORDER BY timestamp DESC');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching transactions:', error.message);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// GET: Retrieve transactions by user_id
app.get('/api/transactions/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const [rows] = await pool.query('SELECT * FROM transactions WHERE user_id = ? ORDER BY timestamp DESC', [userId]);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching user transactions:', error.message);
    res.status(500).json({ error: 'Failed to fetch user transactions' });
  }
});

// PUT: Update a transaction
app.put('/api/transactions/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { id } = req.params;
    const { quantity, type, asset_type } = req.body;
    if (!quantity || !type || !asset_type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (quantity <= 0) {
      return res.status(400).json({ error: 'Invalid quantity' });
    }
    if (!['stock', 'bond', 'mutual_fund'].includes(asset_type)) {
      return res.status(400).json({ error: 'Invalid asset type' });
    }

    // Fetch original transaction
    const [rows] = await connection.query('SELECT * FROM transactions WHERE id = ?', [id]);
    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ error: 'Transaction not found' });
    }
    const original = rows[0];

    // Fetch real-time price
    const response = await axios.get(`${BASE_URL}/quote?symbol=${original.symbol}&apikey=${API_KEY}`);
    if (response.data.status === 'error') {
      await connection.rollback();
      return res.status(404).json({ error: response.data.message });
    }
    const price = response.data.close;

    // Reverse original transaction impact
    if (original.type === 'buy') {
      await connection.query('UPDATE settlement_accounts SET balance = balance + ? WHERE user_id = ?', [original.quantity * original.price, original.user_id]);
    } else if (original.type === 'sell') {
      await connection.query('UPDATE settlement_accounts SET balance = balance - ? WHERE user_id = ?', [original.quantity * original.price, original.user_id]);
    }

    // Apply new transaction impact
    if (type === 'buy') {
      const [rows] = await connection.query('SELECT balance FROM settlement_accounts WHERE user_id = ?', [original.user_id]);
      const balance = rows[0]?.balance || 0;
      const totalCost = quantity * price;
      if (balance < totalCost) {
        await connection.rollback();
        return res.status(400).json({ error: 'Insufficient balance' });
      }
      await connection.query('UPDATE settlement_accounts SET balance = balance - ? WHERE user_id = ?', [totalCost, original.user_id]);
    } else if (type === 'sell') {
      const [holdings] = await connection.query(
        'SELECT SUM(CASE WHEN type = "buy" THEN quantity ELSE -quantity END) as total_quantity ' +
        'FROM transactions WHERE user_id = ? AND symbol = ? AND asset_type = ? AND id != ?',
        [original.user_id, original.symbol, asset_type, id]
      );
      const totalQuantity = holdings[0]?.total_quantity || 0;
      if (totalQuantity < quantity) {
        await connection.rollback();
        return res.status(400).json({ error: 'Insufficient holdings' });
      }
      await connection.query('UPDATE settlement_accounts SET balance = balance + ? WHERE user_id = ?', [quantity * price, original.user_id]);
    }

    // Update transaction
    await connection.query(
      'UPDATE transactions SET quantity = ?, price = ?, type = ?, asset_type = ?, timestamp = CURRENT_TIMESTAMP WHERE id = ?',
      [quantity, price, type, asset_type, id]
    );
    await connection.commit();
    res.json({ id, user_id: original.user_id, symbol: original.symbol, quantity, price, type, asset_type, timestamp: new Date() });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating transaction:', error.message);
    res.status(500).json({ error: 'Failed to update transaction' });
  } finally {
    connection.release();
  }
});

// DELETE: Delete a transaction
app.delete('/api/transactions/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { id } = req.params;
    const [rows] = await connection.query('SELECT * FROM transactions WHERE id = ?', [id]);
    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ error: 'Transaction not found' });
    }
    const transaction = rows[0];

    // Reverse transaction impact
    if (transaction.type === 'buy') {
      await connection.query('UPDATE settlement_accounts SET balance = balance + ? WHERE user_id = ?', [transaction.quantity * transaction.price, transaction.user_id]);
    } else if (transaction.type === 'sell') {
      const [holdings] = await connection.query(
        'SELECT SUM(CASE WHEN type = "buy" THEN quantity ELSE -quantity END) as total_quantity ' +
        'FROM transactions WHERE user_id = ? AND symbol = ? AND asset_type = ? AND id != ?',
        [transaction.user_id, transaction.symbol, transaction.asset_type, id]
      );
      const totalQuantity = holdings[0]?.total_quantity || 0;
      if (totalQuantity + transaction.quantity < 0) {
        await connection.rollback();
        return res.status(400).json({ error: 'Cannot delete: insufficient holdings after reversal' });
      }
      await connection.query('UPDATE settlement_accounts SET balance = balance - ? WHERE user_id = ?', [transaction.quantity * transaction.price, transaction.user_id]);
    }

    await connection.query('DELETE FROM transactions WHERE id = ?', [id]);
    await connection.commit();
    res.json({ message: 'Transaction deleted' });
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting transaction:', error.message);
    res.status(500).json({ error: 'Failed to delete transaction' });
  } finally {
    connection.release();
  }
});

// GET: Retrieve settlement account balance
app.get('/api/settlement/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const [rows] = await pool.query('SELECT balance FROM settlement_accounts WHERE user_id = ?', [userId]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Settlement account not found' });
    }
    res.json({ user_id: userId, balance: rows[0].balance });
  } catch (error) {
    console.error('Error fetching settlement account:', error.message);
    res.status(500).json({ error: 'Failed to fetch settlement account' });
  }
});

// POST: Initialize or update settlement account balance
app.post('/api/settlement/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { balance } = req.body;
    if (typeof balance !== 'number' || balance < 0) {
      return res.status(400).json({ error: 'Invalid balance' });
    }
    const [rows] = await pool.query('SELECT * FROM settlement_accounts WHERE user_id = ?', [userId]);
    if (rows.length) {
      await pool.query('UPDATE settlement_accounts SET balance = ? WHERE user_id = ?', [balance, userId]);
    } else {
      await pool.query('INSERT INTO settlement_accounts (user_id, balance) VALUES (?, ?)', [userId, balance]);
    }
    res.json({ user_id: userId, balance });
  } catch (error) {
    console.error('Error updating settlement account:', error.message);
    res.status(500).json({ error: 'Failed to update settlement account' });
  }
});

// DELETE: Erase all transactions and reset settlement accounts
app.delete('/api/erase', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM transactions');
    await connection.query('DELETE FROM settlement_accounts');
    await connection.commit();
    res.json({ message: 'All transactions and settlement accounts erased' });
  } catch (error) {
    await connection.rollback();
    console.error('Error erasing data:', error.message);
    res.status(500).json({ error: 'Failed to erase data' });
  } finally {
    connection.release();
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;