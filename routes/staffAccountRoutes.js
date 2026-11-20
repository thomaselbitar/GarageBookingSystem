const express = require('express');
const router = express.Router();

const staffAccountController = require('../controllers/staffAccountController');
const customerAdminController = require('../controllers/customerAdminController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const {
    staffAccountValidators,
    employeePasswordValidators
} = require('../validators/staffAccountValidators');

const adminOnly = [requireAuth, requireRole('ADMIN')];

router.get('/admin/dashboard', adminOnly, staffAccountController.getDashboard);
router.get('/admin/customers', adminOnly, customerAdminController.getCustomers);
router.get('/admin/customers/:id', adminOnly, customerAdminController.getCustomer);
router.post(
    '/admin/customers/:id/status',
    adminOnly,
    customerAdminController.updateCustomerStatus
);
router.get('/admin/employees', adminOnly, staffAccountController.getEmployees);
router.get('/admin/employees/:id', adminOnly, staffAccountController.getEmployee);
router.post(
    '/admin/employees/:id/status',
    adminOnly,
    staffAccountController.updateEmployeeStatus
);
router.post(
    '/admin/employees/:id/delete',
    adminOnly,
    staffAccountController.deleteEmployee
);
router.post(
    '/admin/employees/:id/password',
    adminOnly,
    employeePasswordValidators,
    staffAccountController.updateEmployeePassword
);
router.get('/admin/staff', adminOnly, staffAccountController.getCreateStaff);
router.post(
    '/admin/staff',
    adminOnly,
    staffAccountValidators,
    staffAccountController.createStaffAccount
);
router.get('/admin/staff/created', adminOnly, staffAccountController.getCreatedStaffAccount);

module.exports = router;
