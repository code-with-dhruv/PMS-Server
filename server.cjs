const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors');
const dotenv = require('dotenv');

// import express from 'express';
// import mysql from 'mysql2/promise'
// import bodyParser from 'body-parser';
// import axios from 'axios';
// import cors from 'cors';
// import dotenv from 'dotenv'

dotenv.config();
const BASE_URL = 'https://api.twelvedata.com';
const API_KEY = process.env.TWELVE_DATA_API_KEY || '4a9c5da4c0f14eda8c9b0fd1072f8614';
const SUDO_KEY = 'admin123';

const BASE_URL_YAHOO = 'https://apidojo-yahoo-finance-v1.p.rapidapi.com';
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '20348e2d16mshaa1cb0123ebee27p165a45jsn11bec1c1a62e';
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || 'apidojo-yahoo-finance-v1.p.rapidapi.com';

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'n3u3da!',
    database: 'proj',
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

app.get('/api/top-movers', async (req, res) => {
    try {
        const response = await axios.get(
            'https://apidojo-yahoo-finance-v1.p.rapidapi.com/market/v2/get-movers',
            {
                params: {
                    region: 'US',
                    lang: 'en'
                },
                headers: {
                    'X-RapidAPI-Key': RAPIDAPI_KEY,
                    'X-RapidAPI-Host': 'apidojo-yahoo-finance-v1.p.rapidapi.com'
                }
            }
        );

        const quotes = response.data.finance?.result?.[0]?.quotes || [];

        // Pick top 5
        const topMovers = quotes.slice(0, 5).map(q => ({
            symbol: q.symbol,
            price: q.regularMarketPrice
        }));

        res.json(topMovers);
    } catch (error) {
        console.error('❌ Yahoo API error:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to fetch top movers' });
    }
});

// const axios = require('axios');
  


// app.get('/api/top-losers', async (req, res) => {
//     try {
//         const response = await axios.get(
//             'https://apidojo-yahoo-finance-v1.p.rapidapi.com/market/get-movers',
//             {
//                 params: {
//                     region: 'US',
//                     lang: 'en-US',
//                     count: 25 // Fetch more to allow sorting
//                 },
//                 headers: {
//                     'X-RapidAPI-Key': RAPIDAPI_KEY,
//                     'X-RapidAPI-Host': 'apidojo-yahoo-finance-v1.p.rapidapi.com'
//                 }
//             }
//         );

//         const quotes = response.data.finance?.result?.[0]?.quotes || [];

//         console.log('📊 Quotes Received:', quotes.map(q => ({
//             symbol: q.symbol,
//             price: q.regularMarketPrice,
//             change: q.regularMarketChangePercent
//         })));

//         // Sort and pick top 5 losers safely
//         const topLosers = quotes
//             .filter(q => typeof q.regularMarketChangePercent === 'number')
//             .sort((a, b) => a.regularMarketChangePercent - b.regularMarketChangePercent)
//             .slice(0, 5)
//             .map(q => ({
//                 symbol: q.symbol,
//                 price: q.regularMarketPrice || 0,
//                 change: q.regularMarketChangePercent || 0
//             }));

//         if (!topLosers.length) {
//             console.warn('⚠️ No valid losers found. Using fallback.');
//             return res.json([
//                 { symbol: 'XYZ', price: 45.6, change: -3.12 },
//                 { symbol: 'ABC', price: 78.9, change: -2.85 },
//                 { symbol: 'DEF', price: 101.5, change: -2.43 },
//                 { symbol: 'GHI', price: 34.2, change: -2.31 },
//                 { symbol: 'JKL', price: 56.8, change: -2.17 }
//             ]);
//         }

//         res.json(topLosers);
//     } catch (error) {
//         console.error('❌ Yahoo API (losers) error:', error.response?.data || error.message);
//         res.status(500).json({ error: 'Failed to fetch top losers' });
//     }
// });


  

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

// app.get('/api/portfolio/:userId', async (req, res) => {
//     try {
//         const { userId } = req.params;
//         const [holdings] = await pool.query(
//             'SELECT symbol, asset_type, SUM(CASE WHEN type = "buy" THEN quantity ELSE -quantity END) as total_quantity ' +
//             'FROM transactions WHERE user_id = ? GROUP BY symbol, asset_type HAVING total_quantity > 0',
//             [userId]
//         );

//         let totalValue = 0;
//         const portfolio = await Promise.all(holdings.map(async (holding) => {
//             const response = await axios.get(`${BASE_URL}/quote?symbol=${holding.symbol}&apikey=${API_KEY}`);
//             if (response.data.status === 'error') return null;
//             const value = holding.total_quantity * parseFloat(response.data.close);
//             totalValue += value;
//             return {
//                 symbol: holding.symbol,
//                 asset_type: holding.asset_type,
//                 quantity: holding.total_quantity,
//                 price: parseFloat(response.data.close),
//                 value
//             };
//         }));

//         const validPortfolio = portfolio.filter(item => item);
//         const diversification = {
//             stock: 0,
//             bond: 0,
//             mutual_fund: 0,
//             common_stock: 0
//         };

//         validPortfolio.forEach(item => {
//             const key = item.asset_type === 'common stock' ? 'stock' : item.asset_type;
//             diversification[key] += (item.value / totalValue) * 100;
//         });

//         res.json({
//             holdings: validPortfolio,
//             diversification: {
//                 stocks: diversification.stock.toFixed(2) + '%',
//                 bonds: diversification.bond.toFixed(2) + '%',
//                 mutual_funds: diversification.mutual_fund.toFixed(2) + '%'
//             },
//             total_value: totalValue.toFixed(2)
//         });
//     } catch (error) {
//         console.error('Error fetching portfolio:', error.message);
//         res.status(500).json({ error: 'Failed to fetch portfolio' });
//     }
// });

// app.get('/api/portfolio/:userId', async (req, res) => {
//     // Simulate some delay
//     await new Promise(resolve => setTimeout(resolve, 500));

//     const dummyPortfolio = [
//         {
//             symbol: 'AAPL',
//             asset_type: 'stock',
//             quantity: 10,
//             price: 185.23,
//             value: 1852.30
//         },
//         {
//             symbol: 'TSLA',
//             asset_type: 'stock',
//             quantity: 5,
//             price: 725.45,
//             value: 3627.25
//         },
//         {
//             symbol: 'VTI',
//             asset_type: 'mutual fund',
//             quantity: 12,
//             price: 250.10,
//             value: 3001.20
//         },
//         {
//             symbol: 'BND',
//             asset_type: 'bond',
//             quantity: 20,
//             price: 80.00,
//             value: 1600.00
//         }
//     ];

//     const totalValue = dummyPortfolio.reduce((sum, item) => sum + item.value, 0);

//     const diversification = {
//         stocks: ((1852.30 + 3627.25) / totalValue * 100).toFixed(2) + '%',
//         bonds: ((1600.00 / totalValue) * 100).toFixed(2) + '%',
//         mutual_funds: ((3001.20 / totalValue) * 100).toFixed(2) + '%'
//     };

//     res.json({
//         holdings: dummyPortfolio,
//         diversification,
//         total_value: totalValue.toFixed(2)
//     });
// });

// app.get('/api/portfolio/:userId', async (req, res) => {
//     try {
//         const { userId } = req.params;

//         const [rows] = await pool.query(
//             `SELECT symbol, asset_type,
//                     SUM(CASE WHEN type = 'buy' THEN quantity ELSE -quantity END) AS total_quantity,
//                     SUM(CASE WHEN type = 'buy' THEN quantity * price ELSE 0 END) AS total_buy_value,
//                     SUM(CASE WHEN type = 'buy' THEN quantity ELSE 0 END) AS total_buy_quantity
//              FROM transactions
//              WHERE user_id = ?
//              GROUP BY symbol, asset_type
//              HAVING total_quantity > 0`,
//             [userId]
//         );

//         if (rows.length === 0) {
//             return res.json({
//                 holdings: [],
//                 diversification: {
//                     stocks: '0.00%',
//                     bonds: '0.00%',
//                     mutual_funds: '0.00%'
//                 },
//                 total_value: '0.00'
//             });
//         }

//         let totalValue = 0;
//         const portfolio = rows.map(item => {
//             const avg_price = item.total_buy_quantity > 0
//                 ? item.total_buy_value / item.total_buy_quantity
//                 : 0;
//             const value = item.total_quantity * avg_price;
//             totalValue += value;

//             return {
//                 symbol: item.symbol,
//                 asset_type: item.asset_type,
//                 quantity: item.total_quantity,
//                 price: avg_price.toFixed(2),
//                 value: value.toFixed(2)
//             };
//         });

//         const diversification = {
//             stocks: 0,
//             bonds: 0,
//             mutual_funds: 0
//         };

//         portfolio.forEach(item => {
//             const rawType = item.asset_type.toLowerCase().replace(/\s/g, '_');
//             let key = rawType;

//             if (rawType === 'common_stock' || rawType === 'stock') key = 'stocks';
//             else if (rawType === 'mutual_fund') key = 'mutual_funds';
//             else if (rawType === 'bond') key = 'bonds';

//             if (diversification[key] !== undefined) {
//                 diversification[key] += (parseFloat(item.value) / totalValue) * 100;
//             }
//         });

//         res.json({
//             holdings: portfolio,
//             diversification: {
//                 stocks: diversification.stocks.toFixed(2) + '%',
//                 bonds: diversification.bonds.toFixed(2) + '%',
//                 mutual_funds: diversification.mutual_funds.toFixed(2) + '%'
//             },
//             total_value: totalValue.toFixed(2)
//         });

//     } catch (error) {
//         console.error('Error fetching portfolio:', error.message);
//         res.status(500).json({ error: 'Failed to fetch portfolio' });
//     }
// });

// app.get('/api/portfolio/:userId', async (req, res) => {
//     try {
//         const { userId } = req.params;

//         const [rows] = await pool.query(
//             `SELECT symbol, asset_type,
//                     SUM(CASE WHEN type = 'buy' THEN quantity ELSE -quantity END) AS total_quantity,
//                     SUM(CASE WHEN type = 'buy' THEN quantity * price ELSE 0 END) AS total_buy_value,
//                     SUM(CASE WHEN type = 'buy' THEN quantity ELSE 0 END) AS total_buy_quantity
//              FROM transactions
//              WHERE user_id = ?
//              GROUP BY symbol, asset_type
//              HAVING total_quantity > 0`,
//             [userId]
//         );

//         if (rows.length === 0) {
//             return res.json({
//                 holdings: [],
//                 diversification: {
//                     stocks: '0.00%',
//                     bonds: '0.00%',
//                     mutual_funds: '0.00%'
//                 },
//                 total_value: '0.00'
//             });
//         }

//         let totalValue = 0;
//         const portfolio = [];

//         for (const item of rows) {
//             const avg_price = item.total_buy_quantity > 0
//                 ? item.total_buy_value / item.total_buy_quantity
//                 : 0;

//             let current_price = 0;

//             try {
//                 const res = await axios.get(`${BASE_URL}/quote?symbol=${item.symbol}&apikey=${API_KEY}`);
//                 const price = parseFloat(res?.data?.close ?? res?.data?.price);

//                 if (!isNaN(price) && price > 0) {
//                     current_price = price;

//                     // ✅ Update or insert into cache
//                     await pool.query(
//                         `INSERT INTO price_cache (symbol, price)
//                          VALUES (?, ?)
//                          ON DUPLICATE KEY UPDATE price = VALUES(price), last_updated = NOW()`,
//                         [item.symbol, current_price]
//                     );
//                 } else {
//                     throw new Error('Invalid price from API');
//                 }
//             } catch (err) {
//                 console.warn(`⚠️ API failed for ${item.symbol}, using cached price.`);

//                 const [cached] = await pool.query(
//                     `SELECT price FROM price_cache WHERE symbol = ?`,
//                     [item.symbol]
//                 );

//                 if (cached.length && cached[0].price) {
//                     current_price = parseFloat(cached[0].price);
//                 } else {
//                     console.error(`❌ No valid cached price for ${item.symbol}`);
//                     continue; // skip this stock
//                 }
//             }

//             const quantity = item.total_quantity;
//             const value = quantity * current_price;
//             const profit_loss = (current_price - avg_price) * quantity;

//             totalValue += value;

//             portfolio.push({
//                 symbol: item.symbol,
//                 asset_type: item.asset_type,
//                 quantity,
//                 avg_price: avg_price.toFixed(2),
//                 current_price: current_price.toFixed(2),
//                 value: value.toFixed(2),
//                 profit_loss: profit_loss.toFixed(2)
//             });
//         }

//         // Diversification calculation
//         const diversification = {
//             stocks: 0,
//             bonds: 0,
//             mutual_funds: 0
//         };

//         portfolio.forEach(item => {
//             const type = item.asset_type.toLowerCase().replace(/\s/g, '_');
//             const key = (type === 'common_stock' || type === 'stock') ? 'stocks'
//                         : (type === 'mutual_fund') ? 'mutual_funds'
//                         : (type === 'bond') ? 'bonds'
//                         : null;

//             if (key) {
//                 diversification[key] += (parseFloat(item.value) / totalValue) * 100;
//             }
//         });

//         res.json({
//             holdings: portfolio,
//             diversification: {
//                 stocks: diversification.stocks.toFixed(2) + '%',
//                 bonds: diversification.bonds.toFixed(2) + '%',
//                 mutual_funds: diversification.mutual_funds.toFixed(2) + '%'
//             },
//             total_value: totalValue.toFixed(2)
//         });

//     } catch (error) {
//         console.error('❌ Portfolio fetch error:', error.message);
//         res.status(500).json({ error: 'Failed to fetch portfolio' });
//     }
// });

// Portfolio API with fallback for missing current price

// Portfolio API with robust fallback handling for current price and accurate profit/loss

app.get('/api/portfolio/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
  
      const [rows] = await pool.query(
        `SELECT symbol, asset_type,
                SUM(CASE WHEN type = 'buy' THEN quantity ELSE -quantity END) AS total_quantity,
                SUM(CASE WHEN type = 'buy' THEN quantity * price ELSE 0 END) AS total_buy_value,
                SUM(CASE WHEN type = 'buy' THEN quantity ELSE 0 END) AS total_buy_quantity
         FROM transactions
         WHERE user_id = ?
         GROUP BY symbol, asset_type
         HAVING total_quantity > 0`,
        [userId]
      );
  
      if (rows.length === 0) {
        return res.json({
          holdings: [],
          diversification: {
            stocks: '0.00%',
            bonds: '0.00%',
            mutual_funds: '0.00%'
          },
          total_value: '0.00'
        });
      }
  
      let totalValue = 0;
      const holdings = await Promise.all(rows.map(async (item) => {
        const avg_price = item.total_buy_quantity > 0
          ? item.total_buy_value / item.total_buy_quantity
          : 0;
  
        let current_price = avg_price; // default fallback
        try {
          const response = await axios.get(`${BASE_URL}/quote?symbol=${item.symbol}&apikey=${API_KEY}`);
          const fetchedPrice = parseFloat(response.data?.close);
          if (!isNaN(fetchedPrice)) {
            current_price = fetchedPrice;
          } else {
            console.warn(`⚠️ Invalid price for ${item.symbol}, fallback to avg_price`);
          }
        } catch (e) {
          console.warn(`⚠️ Quote fetch failed for ${item.symbol}, using avg_price:`, e.message);
        }
  
        const value = item.total_quantity * current_price;
        const profit_loss = (current_price - avg_price) * item.total_quantity;
  
        totalValue += value;
  
        return {
          symbol: item.symbol,
          asset_type: item.asset_type,
          quantity: item.total_quantity,
          avg_price: avg_price.toFixed(2),
          current_price: current_price.toFixed(2),
          value: value.toFixed(2),
          profit_loss: profit_loss.toFixed(2)
        };
      }));
  
      const diversification = {
        stocks: 0,
        bonds: 0,
        mutual_funds: 0
      };
  
      holdings.forEach(item => {
        const rawType = item.asset_type.toLowerCase().replace(/\s/g, '_');
        let key = rawType;
        if (rawType === 'common_stock' || rawType === 'stock') key = 'stocks';
        else if (rawType === 'mutual_fund') key = 'mutual_funds';
        else if (rawType === 'bond') key = 'bonds';
  
        if (diversification[key] !== undefined) {
          diversification[key] += (parseFloat(item.value) / totalValue) * 100;
        }
      });
  
      res.json({
        holdings,
        diversification: {
          stocks: diversification.stocks.toFixed(2) + '%',
          bonds: diversification.bonds.toFixed(2) + '%',
          mutual_funds: diversification.mutual_funds.toFixed(2) + '%'
        },
        total_value: totalValue.toFixed(2)
      });
    } catch (error) {
      console.error('❌ Portfolio fetch error:', error.message);
      res.status(500).json({ error: 'Failed to fetch portfolio' });
    }
  });
  
  




app.get('/api/time_series/:symbol', async (req, res) => {
    const { symbol } = req.params;
    const interval = req.query.interval || '1d';
    const range = req.query.range || '1mo';
    const region = req.query.region || 'US';

    console.log(`🔍 Request for symbol: ${symbol}`);
    console.log('📦 Query Params:', { interval, range, region });

    try {
        const yahooChartUrl = 'https://apidojo-yahoo-finance-v1.p.rapidapi.com/stock/v3/get-chart';

        const params = {
            symbol,
            interval,
            range,
            region
        };

        console.log('📤 Requesting Yahoo Chart API with:', params);

        const response = await axios.get(yahooChartUrl, {
            params,
            headers: {
                'x-rapidapi-key': '20348e2d16mshaa1cb0123ebee27p165a45jsn11bec1c1a62e',
                'x-rapidapi-host': 'apidojo-yahoo-finance-v1.p.rapidapi.com'
            }
        });

        const chart = response.data?.chart?.result?.[0];
        if (!chart || !chart.timestamp || !chart.indicators?.quote?.[0]?.close) {
            console.log('⚠️ No valid chart data received.');
            return res.status(404).json({ error: 'No Yahoo Finance chart data found for this symbol.' });
        }

        const timeSeries = chart.timestamp.map((t, i) => ({
            datetime: new Date(t * 1000).toISOString().split('T')[0],
            close: chart.indicators.quote[0].close[i]
        })).filter(d => d.close !== null);

        console.log(`📊 Retrieved ${timeSeries.length} time points`);
        res.json(timeSeries);

    } catch (error) {
        console.error('❌ Yahoo Chart API error:', error.message);
        res.status(500).json({ error: 'Failed to fetch Yahoo chart time series data.' });
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

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = {app, pool, initializeDatabase}