const bcrypt = require('bcrypt');
const User = require('../models/User');
const { roleByValue } = require('../services/staffAccountService');
const { firstValidationError } = require('../validators/staffAccountValidators');

const BCRYPT_ROUNDS = 10;

const loadOwnAdmin = async (req) => {
    if (!req.session.user || req.session.user.role !== 'ADMIN') {
        return null;
    }

    return User.findOne({
        attributes: ['id', 'fullName', 'username', 'role', 'passwordHash'],
        where: {
            id: req.session.user.id,
            role: 'ADMIN'
        }
    });
};

const profileFrom = (account) => {
    const role = roleByValue(account.role);

    return {
        fullName: account.fullName,
        username: account.username,
        roleLabel: role ? role.label : account.role
    };
};

const renderProfile = (req, res, account) => {
    const formError = req.session.adminProfileError || null;
    const passwordUpdated = req.session.adminProfileNotice === true;
    delete req.session.adminProfileError;
    delete req.session.adminProfileNotice;

    const send = () => {
        res.render('console/profile', {
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

        return res.redirect(303, '/admin/profile');
    });
};

exports.getProfile = async (req, res) => {
    try {
        const account = await loadOwnAdmin(req);
        if (!account) {
            return res.status(403).send('Access Denied');
        }

        return renderProfile(req, res, account);
    } catch (error) {
        console.error('Could not open the admin profile:', error);
        return res.status(500).send('Could not open the profile.');
    }
};

exports.updatePassword = async (req, res) => {
    try {
        const account = await loadOwnAdmin(req);
        if (!account) {
            return res.status(403).send('Access Denied');
        }

        const validationError = firstValidationError(req);
        if (validationError) {
            req.session.adminProfileError = validationError;
            return saveProfileMessage(req, res);
        }

        const currentMatches = await bcrypt.compare(req.body.currentPassword, account.passwordHash);
        if (!currentMatches) {
            req.session.adminProfileError = 'Current password is incorrect.';
            return saveProfileMessage(req, res);
        }

        await account.update({
            passwordHash: await bcrypt.hash(req.body.password, BCRYPT_ROUNDS)
        });

        delete req.session.adminProfileError;
        req.session.adminProfileNotice = true;
        return saveProfileMessage(req, res);
    } catch (error) {
        console.error('Could not update the admin password:', error);
        return res.status(500).send('Could not update the password.');
    }
};
