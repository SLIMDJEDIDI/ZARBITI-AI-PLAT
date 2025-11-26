const express = require('express');

module.exports = function (db, requireRoles) {
  const router = express.Router();

  router.get('/', requireRoles(['admin']), async (req, res, next) => {
    try {
      const users = await db.all('SELECT id, username, role, created_at FROM users ORDER BY created_at DESC');
      res.render('users', { users, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', requireRoles(['admin']), async (req, res, next) => {
    try {
      const { username, password, role } = req.body;
      if (!username || !password || !role) {
        const users = await db.all('SELECT id, username, role, created_at FROM users ORDER BY created_at DESC');
        return res.render('users', { users, error: 'Champs requis manquants' });
      }
      await db.run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, password, role]);
      res.redirect('/users');
    } catch (err) {
      next(err);
    }
  });

  return router;
};
