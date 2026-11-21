const express = require('express');
const router = express.Router();

const employeeDashboardController = require('../controllers/employeeDashboardController');
const { EMPLOYEE_ROLES, requireRole } = require('../middleware/authMiddleware');

router.get(
    '/employee/dashboard',
    requireRole(...EMPLOYEE_ROLES),
    employeeDashboardController.getDashboard
);

module.exports = router;
