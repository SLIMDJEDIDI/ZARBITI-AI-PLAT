const express = require('express');

module.exports = function (db) {
  const router = express.Router();

  router.get('/login', (req, res) => {
    res.render('login', { error: null });
  });

  router.post('/login', async (req, res, next) => {
    try {
      const { username, password } = req.body;
      const user = await db.get('SELECT * FROM users WHERE username = ? AND password = ?', [
        username,
        password,
      ]);
      if (!user) {
        return res.render('login', { error: 'Identifiants invalides' });
      }
      req.session.user = { id: user.id, username: user.username, role: user.role };
      res.redirect('/');
    } catch (err) {
      next(err);
    }
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => {
      res.redirect('/login');
    });
  });

  return router;
};
