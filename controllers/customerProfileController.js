const bcrypt = require('bcrypt');
const User = require('../models/User');
const { firstValidationError } = require('../validators/customerAuthValidators');

const BCRYPT_ROUNDS = 10;

const loadOwnCustomer = async (req) => {
    if (!req.session.user || req.session.user.role !== 'CUSTOMER') {
        return null;
    }

    return User.findOne({
        attributes: ['id', 'fullName', 'email', 'role', 'passwordHash'],
        where: {
            id: req.session.user.id,
            role: 'CUSTOMER'
        }
    });
};

const profileFrom = (account) => {
    return {
        fullName: account.fullName,
        email: account.email || '',
        roleLabel: 'Customer'
    };
};

const renderProfile = (req, res, account) => {
    const formError = req.session.customerProfileError || null;
    const passwordUpdated = req.session.customerProfileNotice === true;
    delete req.session.customerProfileError;
    delete req.session.customerProfileNotice;

    const send = () => {
        res.render('customer/profile', {
            user: req.session.user,
            profile: profileFrom(account),
            formError,
            passwordUpdated
        });
    };

    if (!formError && !passwordUpdated) {
        return send();
    }

    return req.session.save((err) => {
        if (err) {
            console.error('Could not clear the profile message:', err);
        }

        return send();
    });
};

const saveProfileMessage = (req, res) => {
    return req.session.save((err) => {
        if (err) {
            console.error('Could not save the profile message:', err);
            return res.status(500).send('Could not save the form message.');
        }

        return res.redirect(303, '/customer/profile');
    });
};

exports.getProfile = async (req, res) => {
    try {
        const account = await loadOwnCustomer(req);
        if (!account) {
            return res.status(403).send('Access Denied');
        }

        return renderProfile(req, res, account);
    } catch (error) {
        console.error('Could not open the customer profile:', error);
        return res.status(500).send('Could not open the profile.');
    }
};

exports.updatePassword = async (req, res) => {
    try {
        const account = await loadOwnCustomer(req);
        if (!account) {
            return res.status(403).send('Access Denied');
        }

        const validationError = firstValidationError(req);
        if (validationError) {
            req.session.customerProfileError = validationError;
            return saveProfileMessage(req, res);
        }

        const currentMatches = await bcrypt.compare(req.body.currentPassword, account.passwordHash);
        if (!currentMatches) {
            req.session.customerProfileError = 'Current password is incorrect.';
            return saveProfileMessage(req, res);
        }

        await account.update({
            passwordHash: await bcrypt.hash(req.body.password, BCRYPT_ROUNDS)
        });

        delete req.session.customerProfileError;
        req.session.customerProfileNotice = true;
        return saveProfileMessage(req, res);
    } catch (error) {
        console.error('Could not update the customer password:', error);
        return res.status(500).send('Could not update the password.');
    }
};
