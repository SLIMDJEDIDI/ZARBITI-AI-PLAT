const express = require('express');
const session = require('express-session');
const path = require('path');
const bodyParser = require('body-parser');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));

app.use(
  session({
    secret: 'zarbiti-secret',
    resave: false,
    saveUninitialized: false,
  })
);

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user;
  next();
});

function ensureAuthenticated(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

function requireRoles(roles) {
  return (req, res, next) => {
    if (!req.session.user || !roles.includes(req.session.user.role)) {
      return res.status(403).send('Accès refusé');
    }
    next();
  };
}

const authRoutes = require('./routes/auth');
const orderRoutes = require('./routes/orders');
const productionRoutes = require('./routes/production');
const jaxRoutes = require('./routes/jax');
const userRoutes = require('./routes/users');

app.use('/', authRoutes(db));
app.use('/orders', ensureAuthenticated, orderRoutes(db, requireRoles));
app.use('/production', ensureAuthenticated, productionRoutes(db, requireRoles));
app.use('/jax', ensureAuthenticated, jaxRoutes(db, requireRoles));
app.use('/users', ensureAuthenticated, userRoutes(db, requireRoles));

app.get('/', ensureAuthenticated, async (req, res, next) => {
  try {
    const stats = await db.all(`SELECT status, COUNT(*) as count FROM orders GROUP BY status`);
    const byBrand = await db.all(`SELECT brand, COUNT(*) as count FROM orders GROUP BY brand`);
    res.render('dashboard', { stats, byBrand });
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Erreur serveur');
});

db.ready
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database', err);
    process.exit(1);
  });
