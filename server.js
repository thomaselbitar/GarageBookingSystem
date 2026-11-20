
require('dotenv').config();

const express = require('express');
const sequelize = require('./config/database');

const User = require('./models/User');
const session = require('express-session');
const authRoutes = require('./routes/authRoutes');
const { requireAuth, requireRole } = require('./middleware/authMiddleware');

const app = express();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// View Engine
app.set('view engine', 'ejs');

// Session Configuration
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false,
        maxAge: 1000 * 60 * 60 * 2
    }
}));

// Authentication Routes
app.use('/', authRoutes);

// Protected Dashboard
// Admin Dashboard
app.get(
    '/admin/dashboard',
    requireAuth,
    requireRole('ADMIN'),
    (req, res) => {
        res.render('dashboards/admin', {
            user: req.session.user
        });
    }
);

// Start Server
const PORT = process.env.PORT || 3000;

const startServer = async () => {
    try {
        await sequelize.authenticate();
        console.log('MySQL Database Connected Successfully!');

        await sequelize.sync();
        console.log('Database Tables Synchronized Successfully!');

        app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
        });

    } catch (error) {
        console.error('Server Startup Failed:', error);
    }
};

startServer();
