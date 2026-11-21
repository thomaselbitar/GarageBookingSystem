const express = require('express');
const router = express.Router();

const staffAccountController = require('../controllers/staffAccountController');
const customerAdminController = require('../controllers/customerAdminController');
const adminProfileController = require('../controllers/adminProfileController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const {
    STAFF_ROLES,
    STAFF_ROLE_VALUES
} = require('../services/staffAccountService');
const {
    staffAccountValidators,
    currentPasswordValidator,
    employeePasswordValidators
} = require('../validators/staffAccountValidators');

const MANAGER_STAFF_ROLES = STAFF_ROLES.filter(
    (role) => role.value !== 'ADMIN' && role.value !== 'MANAGER'
);

const withConsole = (consoleConfig) => (req, res, next) => {
    req.console = consoleConfig;
    res.locals.console = consoleConfig;
    next();
};

const adminOnly = [
    requireAuth,
    requireRole('ADMIN'),
    withConsole({
        base: '/admin',
        title: 'Admin console',
        roleLabel: 'Administrator',
        eyebrow: 'Administration panel',
        navLabel: 'Admin',
        pageTitle: 'Admin',
        staffRoles: STAFF_ROLES,
        manageableRoles: STAFF_ROLE_VALUES
    })
];

const managerOnly = [
    requireAuth,
    requireRole('MANAGER'),
    withConsole({
        base: '/manager',
        title: 'Manager console',
        roleLabel: 'Manager',
        eyebrow: 'Manager panel',
        navLabel: 'Manager',
        pageTitle: 'Manager',
        staffRoles: MANAGER_STAFF_ROLES,
        manageableRoles: MANAGER_STAFF_ROLES.map((role) => role.value)
    })
];

const registerConsole = (base, guard) => {
    router.get(`${base}/dashboard`, guard, staffAccountController.getDashboard);
    router.get(`${base}/customers`, guard, customerAdminController.getCustomers);
    router.get(`${base}/customers/:id`, guard, customerAdminController.getCustomer);
    router.post(
        `${base}/customers/:id/status`,
        guard,
        customerAdminController.updateCustomerStatus
    );
    router.get(`${base}/employees`, guard, staffAccountController.getEmployees);
    router.get(`${base}/employees/:id`, guard, staffAccountController.getEmployee);
    router.post(
        `${base}/employees/:id/status`,
        guard,
        staffAccountController.updateEmployeeStatus
    );
    router.post(
        `${base}/employees/:id/delete`,
        guard,
        staffAccountController.deleteEmployee
    );
    router.post(
        `${base}/employees/:id/password`,
        guard,
        employeePasswordValidators,
        staffAccountController.updateEmployeePassword
    );
    router.get(`${base}/staff`, guard, staffAccountController.getCreateStaff);
    router.post(
        `${base}/staff`,
        guard,
        staffAccountValidators,
        staffAccountController.createStaffAccount
    );
    router.get(`${base}/staff/created`, guard, staffAccountController.getCreatedStaffAccount);
};

registerConsole('/admin', adminOnly);
registerConsole('/manager', managerOnly);

router.get('/admin/profile', adminOnly, adminProfileController.getProfile);
router.post(
    '/admin/profile/password',
    adminOnly,
    currentPasswordValidator,
    employeePasswordValidators,
    adminProfileController.updatePassword
);

module.exports = router;
