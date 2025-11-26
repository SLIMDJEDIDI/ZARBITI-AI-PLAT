const express = require('express');
const stringify = require('csv-stringify').stringify;

module.exports = function (db, requireRoles) {
  const router = express.Router();

  router.get('/', requireRoles(['production', 'admin']), async (req, res, next) => {
    try {
      const { batch, status, brand } = req.query;
      const clauses = [];
      const params = [];
      if (batch) {
        clauses.push('batches.code = ?');
        params.push(batch);
      }
      if (status) {
        clauses.push('order_items.item_status = ?');
        params.push(status);
      }
      if (brand) {
        clauses.push('orders.brand = ?');
        params.push(brand);
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const items = await db.all(
        `SELECT order_items.*, orders.order_code, orders.brand, batches.code as batch_code
         FROM order_items
         JOIN orders ON orders.id = order_items.order_id
         LEFT JOIN batches ON batches.id = order_items.batch_id
         ${where}
         ORDER BY batches.code DESC, order_items.created_at DESC`,
        params
      );
      res.render('production', { items, filter: { batch, status, brand } });
    } catch (err) {
      next(err);
    }
  });

  router.get('/export', requireRoles(['production', 'admin']), async (req, res, next) => {
    try {
      const { batch, status, brand } = req.query;
      const clauses = [];
      const params = [];
      if (batch) {
        clauses.push('batches.code = ?');
        params.push(batch);
      }
      if (status) {
        clauses.push('order_items.item_status = ?');
        params.push(status);
      }
      if (brand) {
        clauses.push('orders.brand = ?');
        params.push(brand);
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const items = await db.all(
        `SELECT batches.code as batch_code, orders.order_code, orders.brand, order_items.design_name, order_items.size_text,
                order_items.quantity, order_items.item_status
         FROM order_items
         JOIN orders ON orders.id = order_items.order_id
         LEFT JOIN batches ON batches.id = order_items.batch_id
         ${where}
         ORDER BY batches.code DESC, order_items.created_at DESC`,
        params
      );
      stringify(items, { header: true }, (err, output) => {
        if (err) return next(err);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="production.csv"');
        res.send(output);
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
