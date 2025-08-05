# Stock Trading API

## Overview
A Node.js-based REST API for managing stock transactions, settlement accounts, and portfolio data, built with Express.js, Prisma (PostgreSQL), and Yahoo Finance for real-time stock quotes.

## Features
- **Stock Quotes**: Fetch real-time stock quotes using Yahoo Finance.
- **Transactions**: Create, retrieve, and delete buy/sell transactions for stocks, bonds, mutual funds, and common stocks.
- **Settlement Accounts**: Manage user account balances with add/withdraw actions.
- **Portfolio**: View user holdings, diversification, and total portfolio value.
- **Data Erasure**: Admin-only endpoint to clear all transactions and accounts.

## Prerequisites
- Node.js (v16 or higher)
- PostgreSQL database
- npm or yarn
- Yahoo Finance API access (via `yahoo-finance2`)

## Installation
1. **Clone the Repository**:
   ```bash
   git clone <repository-url>
   cd stock-trading-api
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Set Up Environment Variables**:
   Create a `.env` file in the root directory:
   ```
   DATABASE_URL="postgresql://user:password@localhost:5432/db_name"
   PORT=3000
   ```

4. **Set Up Prisma**:
   - Initialize Prisma schema:
     ```bash
     npx prisma init
     ```
   - Update `prisma/schema.prisma` with the provided schema (see below).
   - Run migrations:
     ```bash
     npx prisma migrate dev --name init
     ```

5. **Start the Server**:
   ```bash
   npm start
   ```

## Prisma Schema
The database uses PostgreSQL with the following Prisma schema (`prisma/schema.prisma`):

```prisma
datasource db {
  provider = "postgres"
  url      = env("DATABASE_URL")
}

model Transaction {
  id         Int       @id @default(autoincrement())
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
  userId     String    @map("user_id") @db.VarChar(255)
  symbol     String    @db.VarChar(50)
  quantity   Int
  price      Decimal   @db.Decimal(10, 2)
  type       TransactionType
  assetType  AssetType @map("asset_type")
}

model SettlementAccount {
  id        Int      @id @default(autoincrement())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  userId    String   @unique @map("user_id") @db.VarChar(255)
  balance   Decimal  @db.Decimal(15, 2) @default(0.00)
}

model SettlementTransaction {
  id        Int      @id @default(autoincrement())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  userId    String   @map("user_id") @db.VarChar(255)
  amount    Decimal  @db.Decimal(15, 2)
  action    ActionType
}

enum TransactionType {
  buy
  sell
}

enum AssetType {
  stock
  bond
  mutual_fund
  common_stock
}

enum ActionType {
  add
  withdraw
}
```

## API Endpoints
- **GET /**: Serves the static `index.html` from the `public` folder.
- **GET /api/search/:query**: Search for assets by query (e.g., `/api/search/AAPL`).
- **GET /api/quote/:symbol**: Fetch stock quote for a symbol (e.g., `/api/quote/AAPL`).
- **POST /api/transactions**: Create a transaction (buy/sell).
  ```json
  {
    "user_id": "user1",
    "symbol": "AAPL",
    "quantity": 10,
    "type": "buy",
    "asset_type": "stock"
  }
  ```
- **GET /api/portfolio/:userId**: Retrieve user portfolio with holdings and diversification.
- **GET /api/transactions**: Fetch all transactions.
- **GET /api/transactions/:userId**: Fetch transactions for a specific user.
- **DELETE /api/transactions/:id**: Delete a transaction (requires `x-sudo-key: admin123` header).
- **GET /api/settlement/:userId**: Get user settlement account balance.
- **POST /api/settlement/:userId**: Add or withdraw funds from a settlement account.
  ```json
  {
    "amount": 1000,
    "action": "add"
  }
  ```
- **GET /api/settlement_transactions/:userId**: Fetch settlement transaction history.
- **DELETE /api/erase**: Erase all data (requires `x-sudo-key: admin123` header).

## Testing
1. **Install Test Dependencies**:
   ```bash
   npm install --save-dev jest supertest
   ```

2. **Run Tests**:
   ```bash
   npm test
   ```

3. **Test File**: `server.test.js` includes tests for all endpoints, mocking Prisma and Yahoo Finance dependencies.

## Dependencies
- `express`: Web framework
- `@prisma/client`: Database ORM
- `yahoo-finance2`: Stock quote API
- `cors`: Cross-origin resource sharing
- `body-parser`: Parse JSON request bodies
- `dotenv`: Environment variable management
- `jest`, `supertest`: Testing framework and HTTP testing

## Notes
- **Database**: Ensure PostgreSQL is running and `DATABASE_URL` is set correctly.
- **Testing**: Update `server.test.js` to mock `@prisma/client` for tests (example provided in previous responses).
- **Security**: The `x-sudo-key` (`admin123`) is hardcoded for simplicity; use a secure method in production.
- **Prisma Migrations**: Run `npx prisma migrate dev` after schema changes.