const express = require('express');

module.exports = function (db, requireRoles) {
  const router = express.Router();

  router.get('/', requireRoles(['admin']), async (req, res, next) => {
    try {
      const payments = await db.all('SELECT * FROM jax_payments ORDER BY date DESC');
      const totalPaidRow = await db.get('SELECT IFNULL(SUM(amount), 0) as total FROM jax_payments');
      const totalExpectedRow = await db.get(
        "SELECT IFNULL(SUM(expected_cod), 0) as total FROM orders WHERE status IN ('CONFIRME', 'EN_PRODUCTION', 'TERMINE', 'ARCHIVE')"
      );
      const totalPaid = totalPaidRow?.total || 0;
      const totalExpected = totalExpectedRow?.total || 0;
      res.render('jax', {
        payments,
        totalPaid: (totalPaid / 100.0).toFixed(2),
        totalExpected: (totalExpected / 100.0).toFixed(2),
        remaining: ((totalExpected - totalPaid) / 100.0).toFixed(2),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/payments', requireRoles(['admin']), async (req, res, next) => {
    try {
      const { date, amount, note } = req.body;
      const cents = Math.round(Number.parseFloat(amount || '0') * 100);
      await db.run('INSERT INTO jax_payments (date, amount, note) VALUES (?, ?, ?)', [date, cents, note]);
      res.redirect('/jax');
    } catch (err) {
      next(err);
    }
  });

  return router;
};
