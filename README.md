Zarbiti Platform – backend project
# Zarbiti Central Ops

Simple Express + SQLite app covering sales, production, and JAX delivery money tracking for the three carpet brands (ZARBITI, BMT, TBP).

## Prerequisites
- Node.js 18+

## Setup
```bash
npm install
```

The SQLite database (`data.sqlite`) is created automatically with demo users when the server starts.

## Running
```bash
npm start
```
The app listens on http://localhost:3000.

## Default demo accounts
- `sales` / `password`
- `production` / `password`
- `admin` / `password`

## Usage notes
- Money fields are stored as integer cents for consistency.
- When a sales/admin user confirms an order, all items are assigned to a newly created batch and marked `A_PRODUIRE`, and the order moves to `EN_PRODUCTION`.
- Orders automatically reach `TERMINE` once all items are finished in production.
