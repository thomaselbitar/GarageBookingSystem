
require('dotenv').config();

const express = require('express');
const sequelize = require('./config/database');

const User = require('./models/User');
const Otp = require('./models/Otp');
require('./models/Vehicle');
const session = require('express-session');
const authRoutes = require('./routes/authRoutes');
const customerAuthRoutes = require('./routes/customerAuthRoutes');
const vehicleRoutes = require('./routes/vehicleRoutes');
const staffAccountRoutes = require('./routes/staffAccountRoutes');
const employeeRoutes = require('./routes/employeeRoutes');

const app = express();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

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
app.use('/', customerAuthRoutes);
app.use('/', vehicleRoutes);
app.use('/', staffAccountRoutes);
app.use('/', employeeRoutes);

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
        process.exit(1);
    }
};

startServer();
