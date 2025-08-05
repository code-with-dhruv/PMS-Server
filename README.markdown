# Stock Trading API

## Overview
A Node.js REST API for managing stock transactions and settlement accounts, using Express.js, MySQL, and Yahoo Finance for stock quotes. The front end uses HTML with Tailwind CSS.

![Database ER Diagram](prisma-erd.svg)
## Features
- Fetch real-time stock quotes.
- Create, retrieve, and delete buy/sell transactions.
- Manage user settlement account balances.
- View portfolio with holdings and diversification.
- Admin endpoint to erase all data.
- Responsive UI with HTML and Tailwind CSS.

## Prerequisites
- Node.js (v16+)
- MySQL database
- npm or yarn
- Yahoo Finance API (`yahoo-finance2`)

## Installation
1. **Clone Repository**:
   ```bash
   git clone <repository-url>
   cd stock-trading-api
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Set Up Environment Variables**:
   Create `.env`:
   ```
   DB_HOST=localhost
   DB_USER=your_user
   DB_PASSWORD=your_password
   DB_NAME=your_database
   PORT=3000
   ```

4. **Set Up MySQL**:
   - Create database in MySQL.
   - Run `server.js` to initialize tables (`transactions`, `settlement_accounts`, `settlement_transactions`).

5. **Start Server**:
   ```bash
   npm start
   ```

## Front End
- **Location**: `public/index.html`
- **Styling**: Tailwind CSS (included via CDN or local build).
- **Features**: Displays stock quotes, transaction forms, and portfolio data with responsive design.

## API Endpoints
- **GET /**: Serves `public/index.html`.
- **GET /api/search/:query**: Search assets (e.g., `/api/search/AAPL`).
- **GET /api/quote/:symbol**: Fetch stock quote (e.g., `/api/quote/AAPL`).
- **POST /api/transactions**: Create transaction.
  ```json
  {
    "user_id": "user1",
    "symbol": "AAPL",
    "quantity": 10,
    "type": "buy",
    "asset_type": "stock"
  }
  ```
- **GET /api/portfolio/:userId**: Get user portfolio.
- **GET /api/transactions**: Fetch all transactions.
- **GET /api/transactions/:userId**: Fetch user transactions.
- **DELETE /api/transactions/:id**: Delete transaction (requires `x-sudo-key: admin123`).
- **GET /api/settlement/:userId**: Get settlement balance.
- **POST /api/settlement/:userId**: Add/withdraw funds.
  ```json
  {
    "amount": 1000,
    "action": "add"
  }
  ```
- **GET /api/settlement_transactions/:userId**: Fetch settlement transactions.
- **DELETE /api/erase**: Erase all data (requires `x-sudo-key: admin123`).

## Database Schema
- **transactions**:
  - `id`: INT, PRIMARY KEY, AUTO_INCREMENT
  - `user_id`: VARCHAR(255)
  - `symbol`: VARCHAR(50)
  - `quantity`: INT
  - `price`: DECIMAL(10,2)
  - `type`: ENUM('buy', 'sell')
  - `asset_type`: ENUM('stock', 'bond', 'mutual_fund', 'common stock')
  - `timestamp`: DATETIME, DEFAULT CURRENT_TIMESTAMP

- **settlement_accounts**:
  - `user_id`: VARCHAR(255), PRIMARY KEY
  - `balance`: DECIMAL(15,2), DEFAULT 0.00

- **settlement_transactions**:
  - `id`: INT, PRIMARY KEY, AUTO_INCREMENT
  - `user_id`: VARCHAR(255)
  - `amount`: DECIMAL(15,2)
  - `action`: ENUM('add', 'withdraw')
  - `timestamp`: DATETIME, DEFAULT CURRENT_TIMESTAMP

## Testing
1. **Install Test Dependencies**:
   ```bash
   npm install --save-dev jest supertest
   ```

2. **Run Tests**:
   ```bash
   npm test
   ```

3. **Test File**: `server.test.js` mocks `mysql2/promise` and `yahoo-finance2`.

## Dependencies
- `express`: Web framework
- `mysql2`: MySQL driver
- `yahoo-finance2`: Stock quote API
- `cors`: Cross-origin resource sharing
- `body-parser`: JSON request parsing
- `dotenv`: Environment variables
- `jest`, `supertest`: Testing
- Tailwind CSS: Front-end styling (via CDN or local)

## Notes
- **Database**: Ensure MySQL is running and `.env` variables are set.
- **Front End**: Customize `public/index.html` with Tailwind CSS for UI.
- **Security**: Hardcoded `x-sudo-key` (`admin123`) should be secured in production.
- **Testing**: Mock `mysql2/promise` in `server.test.js` for isolated tests.
