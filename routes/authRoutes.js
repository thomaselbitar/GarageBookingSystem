
const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');

// Display login page
router.get('/login', authController.getLogin);

// Process login form
router.post('/login', authController.postLogin);

// Logout
router.post('/logout', authController.logout);

module.exports = router;
