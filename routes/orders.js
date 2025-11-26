const express = require('express');

function parseMoney(value) {
  const num = Number.parseFloat(value || '0');
  return Math.round(num * 100);
}

function formatMoney(cents) {
  return (cents / 100).toFixed(2);
}

async function getNextOrderCode(db) {
  const next = await db.get('SELECT IFNULL(MAX(id), 0) + 1 as next FROM orders');
  return `CMD-${String(next?.next || 1).padStart(6, '0')}`;
}

async function getNextBatchCode(db) {
  const next = await db.get('SELECT IFNULL(MAX(id), 0) + 1 as next FROM batches');
  return `BATCH-${String(next?.next || 1).padStart(4, '0')}`;
}

async function recalcExpectedCod(db, orderId) {
  const sumRow = await db.get('SELECT IFNULL(SUM(line_total), 0) as total FROM order_items WHERE order_id = ?', [
    orderId,
  ]);
  const deliveryRow = await db.get('SELECT delivery_fee FROM orders WHERE id = ?', [orderId]);
  const expected = (sumRow?.total || 0) + (deliveryRow?.delivery_fee || 0);
  await db.run('UPDATE orders SET expected_cod = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
    expected,
    orderId,
  ]);
  return expected;
}

async function updateOrderStatusFromItems(db, orderId) {
  const counts = await db.get(
    `SELECT SUM(CASE WHEN item_status = 'TERMINE' THEN 1 ELSE 0 END) as done,
            COUNT(*) as total
     FROM order_items WHERE order_id = ?`,
    [orderId]
  );
  if (counts && counts.total > 0 && counts.done === counts.total) {
    await db.run('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
      'TERMINE',
      orderId,
    ]);
  }
}

async function assignBatchIfNeeded(db, orderId) {
  const missing = await db.get(
    'SELECT COUNT(*) as count FROM order_items WHERE order_id = ? AND batch_id IS NULL',
    [orderId]
  );
  if (!missing || missing.count === 0) return null;
  const code = await getNextBatchCode(db);
  const info = await db.run('INSERT INTO batches (code) VALUES (?)', [code]);
  await db.run('UPDATE order_items SET batch_id = ?, item_status = ? WHERE order_id = ?', [
    info.lastID,
    'A_PRODUIRE',
    orderId,
  ]);
  return code;
}

function canEditItems(order) {
  return !['CONFIRME', 'EN_PRODUCTION', 'TERMINE', 'ARCHIVE'].includes(order.status);
}

module.exports = function (db, requireRoles) {
  const router = express.Router();

  router.get('/', async (req, res, next) => {
    try {
      const { status, brand, search, phone, from, to } = req.query;
      const clauses = [];
      const params = [];
      if (status) {
        clauses.push('status = ?');
        params.push(status);
      }
      if (brand) {
        clauses.push('brand = ?');
        params.push(brand);
      }
      if (search) {
        clauses.push('(order_code LIKE ? OR customer_name LIKE ?)');
        params.push(`%${search}%`, `%${search}%`);
      }
      if (phone) {
        clauses.push('customer_phone LIKE ?');
        params.push(`%${phone}%`);
      }
      if (from) {
        clauses.push('date(created_at) >= date(?)');
        params.push(from);
      }
      if (to) {
        clauses.push('date(created_at) <= date(?)');
        params.push(to);
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const orders = await db.all(
        `SELECT *, (expected_cod / 100.0) as expected_cod_display, (delivery_fee / 100.0) as delivery_fee_display
         FROM orders ${where} ORDER BY created_at DESC`,
        params
      );
      res.render('orders', { orders, filter: { status, brand, search, phone, from, to } });
    } catch (err) {
      next(err);
    }
  });

  router.get('/new', requireRoles(['sales', 'admin']), (req, res) => {
    res.render('order_new', { error: null });
  });

  router.post('/', requireRoles(['sales', 'admin']), async (req, res, next) => {
    try {
      const { brand, usage_type, customer_name, customer_phone, customer_address, customer_city, delivery_fee } = req.body;
      const designNames = Array.isArray(req.body.design_name) ? req.body.design_name : [req.body.design_name];
      const sizeTexts = Array.isArray(req.body.size_text) ? req.body.size_text : [req.body.size_text];
      const quantities = Array.isArray(req.body.quantity) ? req.body.quantity : [req.body.quantity];
      const unitPrices = Array.isArray(req.body.unit_price) ? req.body.unit_price : [req.body.unit_price];

      if (!brand || !customer_phone) {
        return res.render('order_new', { error: 'Marque et téléphone client sont requis.' });
      }

      const items = designNames
        .map((name, idx) => ({
          design_name: (name || '').trim(),
          size_text: (sizeTexts[idx] || '').trim(),
          quantity: Number.parseInt(quantities[idx] || '0', 10),
          unit_price: parseMoney(unitPrices[idx] || '0'),
        }))
        .filter((i) => i.design_name && i.quantity > 0);

      if (items.length === 0) {
        return res.render('order_new', { error: 'Ajoutez au moins une ligne produit.' });
      }

      const orderCode = await getNextOrderCode(db);
      const deliveryFeeCents = parseMoney(delivery_fee || '0');

      const orderInfo = await db.run(
        `INSERT INTO orders (order_code, brand, usage_type, customer_name, customer_phone, customer_address, customer_city, delivery_fee)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderCode, brand, usage_type, customer_name, customer_phone, customer_address, customer_city, deliveryFeeCents]
      );

      for (const item of items) {
        const lineTotal = item.quantity * item.unit_price;
        await db.run(
          `INSERT INTO order_items (order_id, design_name, size_text, quantity, unit_price, line_total)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [orderInfo.lastID, item.design_name, item.size_text, item.quantity, item.unit_price, lineTotal]
        );
      }

      await recalcExpectedCod(db, orderInfo.lastID);
      res.redirect(`/orders/${orderInfo.lastID}`);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const order = await db.get(
        `SELECT *, (expected_cod / 100.0) as expected_cod_display, (delivery_fee / 100.0) as delivery_fee_display
         FROM orders WHERE id = ?`,
        [req.params.id]
      );
      if (!order) return res.status(404).send('Commande introuvable');
      const items = await db.all(
        `SELECT order_items.*, batches.code as batch_code, (unit_price / 100.0) as unit_price_display, (line_total / 100.0) as line_total_display
         FROM order_items
         LEFT JOIN batches ON batches.id = order_items.batch_id
         WHERE order_id = ?`,
        [req.params.id]
      );
      res.render('order_detail', {
        order,
        items,
        canEdit: canEditItems(order),
        error: null,
        message: null,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/items', requireRoles(['sales', 'admin']), async (req, res, next) => {
    try {
      const order = await db.get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
      if (!order) return res.status(404).send('Commande introuvable');
      if (!canEditItems(order)) {
        return res.status(400).send('Modification des lignes non autorisée.');
      }
      const { design_name, size_text, quantity, unit_price } = req.body;
      if (!design_name || !quantity) {
        return res.redirect(`/orders/${order.id}`);
      }
      const qty = Number.parseInt(quantity, 10) || 0;
      const price = parseMoney(unit_price || '0');
      await db.run(
        `INSERT INTO order_items (order_id, design_name, size_text, quantity, unit_price, line_total)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [order.id, design_name, size_text, qty, price, qty * price]
      );
      await recalcExpectedCod(db, order.id);
      res.redirect(`/orders/${order.id}`);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:orderId/items/:itemId/delete', requireRoles(['sales', 'admin']), async (req, res, next) => {
    try {
      const order = await db.get('SELECT * FROM orders WHERE id = ?', [req.params.orderId]);
      if (!order) return res.status(404).send('Commande introuvable');
      if (!canEditItems(order)) return res.status(400).send('Suppression non autorisée.');
      await db.run('DELETE FROM order_items WHERE id = ? AND order_id = ?', [req.params.itemId, order.id]);
      await recalcExpectedCod(db, order.id);
      res.redirect(`/orders/${order.id}`);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/status', requireRoles(['sales', 'admin']), async (req, res, next) => {
    try {
      const order = await db.get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
      if (!order) return res.status(404).send('Commande introuvable');
      const { status } = req.body;
      const allowed = {
        NOUVEAU: 'A_CONFIRMER',
        A_CONFIRMER: 'CONFIRME',
        CONFIRME: 'EN_PRODUCTION',
        EN_PRODUCTION: 'TERMINE',
      };
      const nextStatus = allowed[order.status];
      if (status !== nextStatus) {
        return res.status(400).send('Transition non autorisée');
      }
      await db.run('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
        status,
        order.id,
      ]);
      if (status === 'CONFIRME') {
        await assignBatchIfNeeded(db, order.id);
        await db.run('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
          'EN_PRODUCTION',
          order.id,
        ]);
      }
      await updateOrderStatusFromItems(db, order.id);
      res.redirect(`/orders/${order.id}`);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/archive', requireRoles(['admin']), async (req, res, next) => {
    try {
      await db.run('UPDATE orders SET status = ? WHERE id = ?', ['ARCHIVE', req.params.id]);
      res.redirect('/orders');
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/unarchive', requireRoles(['admin']), async (req, res, next) => {
    try {
      await db.run('UPDATE orders SET status = ? WHERE id = ?', ['NOUVEAU', req.params.id]);
      res.redirect('/orders');
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/notes', requireRoles(['sales', 'admin']), async (req, res, next) => {
    try {
      await db.run('UPDATE orders SET internal_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
        req.body.internal_notes || null,
        req.params.id,
      ]);
      res.redirect(`/orders/${req.params.id}`);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:orderId/items/:itemId/status', requireRoles(['production', 'admin']), async (req, res, next) => {
    try {
      const { status } = req.body;
      const orderId = req.params.orderId;
      const valid = ['A_PRODUIRE', 'EN_PRODUCTION', 'TERMINE'];
      if (!valid.includes(status)) return res.status(400).send('Statut invalide');
      await db.run('UPDATE order_items SET item_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
        status,
        req.params.itemId,
      ]);
      await updateOrderStatusFromItems(db, orderId);
      res.redirect(`/orders/${orderId}`);
    } catch (err) {
      next(err);
    }
  });

  return router;
};
