const ROLE_LABELS = {
    WASHING: 'Washing Employee',
    DETAILING: 'Detailing Employee',
    PAINTING: 'Painting Employee',
    MECHANIC: 'Mechanic'
};

exports.getDashboard = (req, res) => {
    const role = req.session.user.role;

    return res.render('employee/dashboard', {
        user: req.session.user,
        roleLabel: ROLE_LABELS[role] || role
    });
};
