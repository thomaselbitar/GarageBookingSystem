
const bcrypt = require('bcrypt');
const User = require('../models/User');

// Display login page
exports.getLogin = (req, res) => {
    res.render('auth/login', {
        error: null,
        deactivated: req.query.deactivated === '1'
    });
};

// Process staff login
exports.postLogin = async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.render('auth/login', {
                error: 'Please enter your username and password.',
                deactivated: false
            });
        }

        const user = await User.findOne({
            where: { username }
        });

        if (user && !user.isActive) {
            return res.render('auth/login', {
                error: null,
                deactivated: true
            });
        }

        if (!user) {
            return res.render('auth/login', {
                error: 'Invalid username or password.',
                deactivated: false
            });
        }

        const passwordMatch = await bcrypt.compare(
            password,
            user.passwordHash
        );

        if (!passwordMatch) {
            return res.render('auth/login', {
                error: 'Invalid username or password.',
                deactivated: false
            });
        }

        // Create a new session after successful login
        req.session.regenerate((err) => {
            if (err) {
                return res.status(500).send('Could not create session.');
            }

            req.session.user = {
                id: user.id,
                fullName: user.fullName,
                username: user.username,
                role: user.role
            };

            req.session.save((err) => {
                if (err) {
                    return res.status(500).send('Could not save session.');
                }

                if (user.role === 'ADMIN') {
                    return res.redirect('/admin/dashboard');
            }

                res.redirect('/dashboard');
            });
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).send('An error occurred during login.');
    }
};

// Logout
exports.logout = (req, res) => {
    const role = req.session.user && req.session.user.role;

    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Could not log out.');
        }

        res.clearCookie('connect.sid');
        res.redirect(role === 'CUSTOMER' ? '/customer/login' : '/login');
    });
};
