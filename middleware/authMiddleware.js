const User = require('../models/User');

const EMPLOYEE_ROLES = ['WASHING', 'DETAILING', 'PAINTING', 'MECHANIC'];

const homeForRole = (role) => {
    if (role === 'CUSTOMER') {
        return '/customer/dashboard';
    }

    if (role === 'ADMIN') {
        return '/admin/dashboard';
    }

    if (role === 'MANAGER') {
        return '/manager/dashboard';
    }

    if (EMPLOYEE_ROLES.includes(role)) {
        return '/employee/dashboard';
    }

    return '/dashboard';
};

const ensureActiveAccount = async (req, res, next) => {
    if (!req.session.user || req.accountActiveChecked) {
        return next();
    }

    req.accountActiveChecked = true;
    const role = req.session.user.role;

    try {
        const account = await User.findByPk(req.session.user.id, {
            attributes: ['isActive']
        });

        if (account && account.isActive) {
            return next();
        }

        return req.session.destroy(() => {
            res.clearCookie('connect.sid');
            return res.redirect(role === 'CUSTOMER' ? '/customer/login?banned=1' : '/login?deactivated=1');
        });
    } catch (error) {
        console.error('Account status check failed:', error);
        return res.status(500).send('Could not verify the account.');
    }
};

const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    return ensureActiveAccount(req, res, next);
};

const requireCustomerAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/customer/login');
    }

    if (req.session.user.role !== 'CUSTOMER') {
        return res.status(403).send('Access Denied');
    }

    return ensureActiveAccount(req, res, next);
};

const requireRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.session.user) {
            if (allowedRoles.includes('CUSTOMER') && allowedRoles.length === 1) {
                return res.redirect('/customer/login');
            }

            return res.redirect('/login');
        }

        return ensureActiveAccount(req, res, () => {
            if (!allowedRoles.includes(req.session.user.role)) {
                if (req.session.user.role === 'CUSTOMER') {
                    return res.redirect('/customer/dashboard');
                }

                return res.status(403).send('Access Denied');
            }

            return next();
        });
    };
};

const redirectIfAuthenticated = (req, res, next) => {
    if (!req.session.user) {
        return next();
    }

    return res.redirect(homeForRole(req.session.user.role));
};

module.exports = {
    EMPLOYEE_ROLES,
    homeForRole,
    requireAuth,
    requireCustomerAuth,
    requireRole,
    redirectIfAuthenticated
};
