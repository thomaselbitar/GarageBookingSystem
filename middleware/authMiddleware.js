
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    next();
};

const requireRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.session.user) {
            return res.redirect('/login');
        }

        if (!allowedRoles.includes(req.session.user.role)) {
            return res.status(403).send('Access Denied');
        }

        next();
    };
};

module.exports = {
    requireAuth,
    requireRole
};
