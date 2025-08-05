const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();
const BASE_URL = 'https://api.twelvedata.com';
const API_KEY = process.env.TWELVE_DATA_API_KEY || '6b4a261335974ce2865386d858dbe6ff';
const SUDO_KEY = 'admin123';

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

pool.getConnection()
    .then((connection) => {
        console.log('Database connected successfully');
        connection.release();
    })
    .catch((err) => {
        console.error('Database connection failed:', err.message);
        process.exit(1);
    });

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
                asset_type ENUM('stock', 'bond', 'mutual_fund','common stock') NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await connection.query(`
            CREATE TABLE IF NOT EXISTS settlement_accounts (
                user_id VARCHAR(255) PRIMARY KEY,
                balance DECIMAL(15,2) NOT NULL DEFAULT 0.00
            )
        `);
        await connection.query(`
            CREATE TABLE IF NOT EXISTS settlement_transactions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                amount DECIMAL(15,2) NOT NULL,
                action ENUM('add', 'withdraw') NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        connection.release();
        console.log('Database tables initialized');
    } catch (error) {
        console.error('Error initializing database:', error.message);
    }
}
initializeDatabase();

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.get('/api/search/:query', async (req, res) => {
    try {
        const { query } = req.params;
        const response = await axios.get(`${BASE_URL}/symbol_search?symbol=${query}&limit=5&apikey=${API_KEY}`);
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

app.post('/api/transactions', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { user_id, symbol, quantity, type, asset_type = 'stock' } = req.body;
        if (!user_id || !symbol || !quantity || !type) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        if (quantity <= 0) {
            return res.status(400).json({ error: 'Invalid quantity' });
        }
        if (!['stock', 'bond', 'mutual_fund', 'common stock'].includes(asset_type)) {
            return res.status(400).json({ error: 'Invalid asset type' });
        }

        const response = await axios.get(`${BASE_URL}/quote?symbol=${symbol}&apikey=${API_KEY}`);
        console.log('Twelve Data API response:', response.data); // Debug log
        if (response.data.status === 'error') {
            await connection.rollback();
            return res.status(404).json({ error: response.data.message });
        }
        const price = parseFloat(response.data.close);
        if (isNaN(price)) {
            await connection.rollback();
            return res.status(500).json({ error: 'Invalid price from quote API' });
        }

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

        const [result] = await connection.query(
            'INSERT INTO transactions (user_id, symbol, quantity, price, type, asset_type) VALUES (?, ?, ?, ?, ?, ?)',
            [user_id, symbol, quantity, price, type, asset_type]
        );
        await connection.commit();
        res.status(201).json({ id: result.insertId, user_id, symbol, quantity, price, type, asset_type, timestamp: new Date() });
    } catch (error) {
        await connection.rollback();
        console.error('Error creating transaction:', error.message);
        res.status(500).json({ error: 'Failed to create transaction: ' + error.message });
    } finally {
        connection.release();
    }
});

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
            const value = holding.total_quantity * parseFloat(response.data.close);
            totalValue += value;
            return {
                symbol: holding.symbol,
                asset_type: holding.asset_type,
                quantity: holding.total_quantity,
                price: parseFloat(response.data.close),
                value
            };
        }));

        const validPortfolio = portfolio.filter(item => item);
        const diversification = {
            stock: 0,
            bond: 0,
            mutual_fund: 0,
            common_stock: 0
        };

        validPortfolio.forEach(item => {
            const key = item.asset_type === 'common stock' ? 'stock' : item.asset_type;
            diversification[key] += (item.value / totalValue) * 100;
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

app.get('/api/transactions', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM transactions ORDER BY timestamp DESC');
        res.json(rows);
    } catch (error) {
        console.error('Error fetching transactions:', error.message);
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

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

app.delete('/api/transactions/:id', async (req, res) => {
    const sudoKey = req.headers['x-sudo-key'];
    if (sudoKey !== SUDO_KEY) {
        return res.status(403).json({ error: 'Invalid sudo key' });
    }

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

app.get('/api/settlement/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const [rows] = await pool.query('SELECT balance FROM settlement_accounts WHERE user_id = ?', [userId]);
        if (!rows.length) {
            await pool.query('INSERT INTO settlement_accounts (user_id, balance) VALUES (?, ?)', [userId, 0.00]);
            return res.json({ user_id: userId, balance: '0.00' });
        }
        res.json({ user_id: userId, balance: parseFloat(rows[0].balance).toFixed(2) });
    } catch (error) {
        console.error('Error fetching settlement account:', error.message);
        res.status(500).json({ error: 'Failed to fetch settlement account' });
    }
});

app.post('/api/settlement/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { amount, action } = req.body;
        const parsedAmount = parseFloat(amount).toFixed(2);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            return res.status(400).json({ error: 'Invalid amount' });
        }
        if (!['add', 'withdraw'].includes(action)) {
            return res.status(400).json({ error: 'Invalid action' });
        }

        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            const [rows] = await connection.query('SELECT balance FROM settlement_accounts WHERE user_id = ?', [userId]);
            let currentBalance = rows[0]?.balance || 0;

            if (action === 'withdraw' && currentBalance < parsedAmount) {
                await connection.rollback();
                return res.status(400).json({ error: 'Insufficient balance for withdrawal' });
            }

            const newBalance = action === 'add'
                ? (parseFloat(currentBalance) + parseFloat(parsedAmount)).toFixed(2)
                : (parseFloat(currentBalance) - parseFloat(parsedAmount)).toFixed(2);

            if (rows.length) {
                await connection.query('UPDATE settlement_accounts SET balance = ? WHERE user_id = ?', [newBalance, userId]);
            } else {
                await connection.query('INSERT INTO settlement_accounts (user_id, balance) VALUES (?, ?)', [userId, newBalance]);
            }

            await connection.query(
                'INSERT INTO settlement_transactions (user_id, amount, action) VALUES (?, ?, ?)',
                [userId, parsedAmount, action]
            );

            await connection.commit();
            res.json({ user_id: userId, balance: parseFloat(newBalance).toFixed(2) });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error updating settlement account:', error.message);
        res.status(500).json({ error: 'Failed to update settlement account' });
    }
});

app.get('/api/settlement_transactions/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const [rows] = await pool.query(
            'SELECT id, amount, action, timestamp FROM settlement_transactions WHERE user_id = ? ORDER BY timestamp DESC',
            [userId]
        );
        res.json(rows);
    } catch (error) {
        console.error('Error fetching settlement transactions:', error.message);
        res.status(500).json({ error: 'Failed to fetch settlement transactions' });
    }
});

app.delete('/api/erase', async (req, res) => {
    const sudoKey = req.headers['x-sudo-key'];
    if (sudoKey !== SUDO_KEY) {
        return res.status(403).json({ error: 'Invalid sudo key' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        await connection.query('DELETE FROM transactions');
        await connection.query('DELETE FROM settlement_accounts');
        await connection.query('DELETE FROM settlement_transactions');
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

// Catch-all route for unmatched API requests
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = app;