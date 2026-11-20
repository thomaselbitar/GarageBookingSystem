const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    next();
};

const requireCustomerAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/customer/login');
    }

    if (req.session.user.role !== 'CUSTOMER') {
        return res.status(403).send('Access Denied');
    }

    next();
};

const requireRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.session.user) {
            if (allowedRoles.includes('CUSTOMER') && allowedRoles.length === 1) {
                return res.redirect('/customer/login');
            }

            return res.redirect('/login');
        }

        if (!allowedRoles.includes(req.session.user.role)) {
            if (req.session.user.role === 'CUSTOMER') {
                return res.redirect('/customer/dashboard');
            }

            return res.status(403).send('Access Denied');
        }

        next();
    };
};

const redirectIfAuthenticated = (req, res, next) => {
    if (!req.session.user) {
        return next();
    }

    if (req.session.user.role === 'CUSTOMER') {
        return res.redirect('/customer/dashboard');
    }

    if (req.session.user.role === 'ADMIN') {
        return res.redirect('/admin/dashboard');
    }

    return res.redirect('/dashboard');
};

module.exports = {
    requireAuth,
    requireCustomerAuth,
    requireRole,
    redirectIfAuthenticated
};
