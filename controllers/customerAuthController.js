const bcrypt = require('bcrypt');
const User = require('../models/User');
const { isEmailConfigured, sendOtpEmail } = require('../config/mailer');
const { issueOtp, verifyOtp, getResendWaitSeconds } = require('../services/otpService');
const { firstValidationError } = require('../validators/customerAuthValidators');

const BCRYPT_ROUNDS = 10;
const RESET_CODE_SENT_MESSAGE = 'We sent a verification code to your email.';

const maskEmail = (email) => {
    const [local, domain] = String(email).split('@');
    if (!domain || local.length < 2) {
        return email;
    }

    return `${local[0]}***@${domain}`;
};

const customerDisplayName = (email) => {
    const local = String(email).split('@')[0] || 'Customer';
    return local.replace(/[._-]+/g, ' ').slice(0, 100);
};

const renderAuth = (res, view, data = {}) => {
    return res.render(view, {
        error: null,
        success: null,
        email: '',
        resendWait: 0,
        ...data
    });
};

const resendWaitFor = (req) => {
    return getResendWaitSeconds(req.session.customerAuth && req.session.customerAuth.otpSentAt);
};

const renderVerify = (req, res, data = {}) => {
    return renderAuth(res, 'customer/verify-otp', {
        resendWait: resendWaitFor(req),
        ...data
    });
};

const createCustomerSession = (req, res, user, destination) => {
    req.session.regenerate((err) => {
        if (err) {
            return res.status(500).send('Could not create session.');
        }

        req.session.user = {
            id: user.id,
            fullName: user.fullName,
            email: user.email,
            role: user.role
        };

        req.session.save((saveErr) => {
            if (saveErr) {
                return res.status(500).send('Could not save session.');
            }

            return res.redirect(destination);
        });
    });
};

const requirePending = (purpose, verified = false) => {
    return (req, res, next) => {
        const pending = req.session.customerAuth;

        if (!pending || pending.purpose !== purpose || !pending.email) {
            if (purpose === 'SIGNUP') {
                return res.redirect('/customer/signup');
            }

            return res.redirect('/customer/forgot-password');
        }

        if (verified && !pending.verified) {
            if (purpose === 'SIGNUP') {
                return res.redirect('/customer/signup/verify');
            }

            return res.redirect('/customer/forgot-password/verify');
        }

        next();
    };
};

const sendAndStoreOtp = async (req, email, purpose) => {
    if (!isEmailConfigured()) {
        const error = new Error('Email is not configured.');
        error.code = 'EMAIL_NOT_CONFIGURED';
        throw error;
    }

    const code = await issueOtp(email, purpose);
    await sendOtpEmail(email, code, purpose);

    req.session.customerAuth = {
        email,
        purpose,
        verified: false,
        verifyAttempts: 0,
        otpSentAt: Date.now()
    };
};

exports.requirePendingSignup = requirePending('SIGNUP', false);
exports.requireVerifiedSignup = requirePending('SIGNUP', true);
exports.requirePendingReset = requirePending('PASSWORD_RESET', false);
exports.requireVerifiedReset = requirePending('PASSWORD_RESET', true);

exports.getSignup = (req, res) => {
    return renderAuth(res, 'customer/signup');
};

exports.postSignup = async (req, res) => {
    const validationError = firstValidationError(req);
    if (validationError) {
        return renderAuth(res, 'customer/signup', {
            error: validationError,
            email: req.body.email
        });
    }

    const email = String(req.body.email).trim().toLowerCase();

    try {
        const existing = await User.findOne({ where: { email } });
        if (existing) {
            return renderAuth(res, 'customer/signup', {
                error: 'An account with this email already exists. Please log in instead.',
                email
            });
        }

        await sendAndStoreOtp(req, email, 'SIGNUP');

        req.session.save((err) => {
            if (err) {
                return res.status(500).send('Could not start verification.');
            }

            return res.redirect('/customer/signup/verify');
        });
    } catch (error) {
        if (error.code === 'OTP_RATE_LIMIT') {
            return renderAuth(res, 'customer/signup', {
                error: error.message,
                email
            });
        }

        if (error.code === 'EMAIL_NOT_CONFIGURED') {
            return renderAuth(res, 'customer/signup', {
                error: 'Email delivery is not configured yet. Please try again later.',
                email
            });
        }

        console.error('Customer signup error:', error);
        return renderAuth(res, 'customer/signup', {
            error: 'Unable to send a verification code right now. Please try again later.',
            email
        });
    }
};

exports.getSignupVerify = (req, res) => {
    return renderVerify(req, res, {
        email: maskEmail(req.session.customerAuth.email),
        action: '/customer/signup/verify',
        resendAction: '/customer/signup/resend',
        title: 'Verify your email',
        lede: 'Enter the 6-digit code we sent to complete your sign up.'
    });
};

exports.postSignupVerify = async (req, res) => {
    const pending = req.session.customerAuth;
    const viewData = {
        email: maskEmail(pending.email),
        action: '/customer/signup/verify',
        resendAction: '/customer/signup/resend',
        title: 'Verify your email',
        lede: 'Enter the 6-digit code we sent to complete your sign up.'
    };

    const validationError = firstValidationError(req);
    if (validationError) {
        return renderVerify(req, res, {
            ...viewData,
            error: validationError
        });
    }

    try {
        const result = await verifyOtp(
            pending.email,
            'SIGNUP',
            req.body.otp,
            pending
        );

        if (!result.ok) {
            return renderVerify(req, res, {
                ...viewData,
                error: result.message
            });
        }

        pending.verified = true;

        req.session.save((err) => {
            if (err) {
                return res.status(500).send('Could not continue sign up.');
            }

            return res.redirect('/customer/signup/password');
        });
    } catch (error) {
        console.error('Signup OTP verification error:', error);
        return renderVerify(req, res, {
            ...viewData,
            error: 'Unable to verify that code right now. Please try again.'
        });
    }
};

exports.postSignupResend = async (req, res) => {
    const pending = req.session.customerAuth;
    const viewData = {
        email: maskEmail(pending.email),
        action: '/customer/signup/verify',
        resendAction: '/customer/signup/resend',
        title: 'Verify your email',
        lede: 'Enter the 6-digit code we sent to complete your sign up.'
    };

    try {
        const existing = await User.findOne({ where: { email: pending.email } });
        if (existing) {
            delete req.session.customerAuth;
            return res.redirect('/customer/login');
        }

        await sendAndStoreOtp(req, pending.email, 'SIGNUP');

        req.session.save((err) => {
            if (err) {
                return renderVerify(req, res, {
                    ...viewData,
                    error: 'Could not resend the code. Please try again.'
                });
            }

            return renderVerify(req, res, {
                ...viewData,
                success: 'A new verification code was sent.'
            });
        });
    } catch (error) {
        if (error.code === 'OTP_RATE_LIMIT') {
            return renderVerify(req, res, {
                ...viewData,
                error: error.retryAfter ? null : error.message,
                resendWait: error.retryAfter || resendWaitFor(req)
            });
        }

        console.error('Signup OTP resend error:', error);
        return renderVerify(req, res, {
            ...viewData,
            error: 'Unable to resend a verification code right now.'
        });
    }
};

exports.getSignupPassword = (req, res) => {
    return renderAuth(res, 'customer/create-password', {
        action: '/customer/signup/password',
        title: 'Create your password',
        lede: 'Choose a password to finish creating your customer account.',
        submitLabel: 'Create account'
    });
};

exports.postSignupPassword = async (req, res) => {
    const pending = req.session.customerAuth;
    const viewData = {
        action: '/customer/signup/password',
        title: 'Create your password',
        lede: 'Choose a password to finish creating your customer account.',
        submitLabel: 'Create account'
    };

    const validationError = firstValidationError(req);
    if (validationError) {
        return renderAuth(res, 'customer/create-password', {
            ...viewData,
            error: validationError
        });
    }

    try {
        const existing = await User.findOne({ where: { email: pending.email } });
        if (existing) {
            delete req.session.customerAuth;
            return renderAuth(res, 'customer/login', {
                error: 'An account with this email already exists. Please log in instead.',
                email: pending.email
            });
        }

        const passwordHash = await bcrypt.hash(req.body.password, BCRYPT_ROUNDS);

        const user = await User.create({
            fullName: customerDisplayName(pending.email),
            email: pending.email,
            username: null,
            passwordHash,
            role: 'CUSTOMER',
            isActive: true
        });

        return createCustomerSession(req, res, user, '/customer/dashboard');
    } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            return renderAuth(res, 'customer/login', {
                error: 'An account with this email already exists. Please log in instead.',
                email: pending.email
            });
        }

        console.error('Customer account creation error:', error);
        return renderAuth(res, 'customer/create-password', {
            ...viewData,
            error: 'Unable to create your account right now. Please try again.'
        });
    }
};

exports.getLogin = (req, res) => {
    const success = req.query.message === 'password-reset'
        ? 'Your password was updated. You can log in now.'
        : null;

    return renderAuth(res, 'customer/login', { success });
};

exports.postLogin = async (req, res) => {
    const validationError = firstValidationError(req);
    if (validationError) {
        return renderAuth(res, 'customer/login', {
            error: validationError,
            email: req.body.email
        });
    }

    const email = String(req.body.email).trim().toLowerCase();
    const invalidMessage = 'Invalid email or password.';

    try {
        const user = await User.findOne({
            where: {
                email,
                role: 'CUSTOMER'
            }
        });

        if (!user || !user.isActive || !user.passwordHash) {
            return renderAuth(res, 'customer/login', {
                error: invalidMessage,
                email
            });
        }

        const passwordMatch = await bcrypt.compare(req.body.password, user.passwordHash);
        if (!passwordMatch) {
            return renderAuth(res, 'customer/login', {
                error: invalidMessage,
                email
            });
        }

        return createCustomerSession(req, res, user, '/customer/dashboard');
    } catch (error) {
        console.error('Customer login error:', error);
        return renderAuth(res, 'customer/login', {
            error: 'An error occurred during login.',
            email
        });
    }
};

exports.getForgotPassword = (req, res) => {
    return renderAuth(res, 'customer/forgot-password');
};

exports.postForgotPassword = async (req, res) => {
    const validationError = firstValidationError(req);
    if (validationError) {
        return renderAuth(res, 'customer/forgot-password', {
            error: validationError,
            email: req.body.email
        });
    }

    const email = String(req.body.email).trim().toLowerCase();

    try {
        const user = await User.findOne({
            where: {
                email,
                role: 'CUSTOMER'
            }
        });

        if (!user) {
            return renderAuth(res, 'customer/forgot-password', {
                error: 'This email does not exist.',
                email
            });
        }

        if (!user.isActive) {
            return renderAuth(res, 'customer/forgot-password', {
                error: 'This email does not exist.',
                email
            });
        }

        try {
            await sendAndStoreOtp(req, email, 'PASSWORD_RESET');
        } catch (error) {
            if (error.code === 'OTP_RATE_LIMIT') {
                return renderAuth(res, 'customer/forgot-password', {
                    error: error.message,
                    email
                });
            }

            if (error.code === 'EMAIL_NOT_CONFIGURED') {
                return renderAuth(res, 'customer/forgot-password', {
                    error: 'Email delivery is not configured yet. Please try again later.',
                    email
                });
            }

            console.error('Forgot password email error:', error);
            return renderAuth(res, 'customer/forgot-password', {
                error: 'Unable to send a verification code right now. Please try again later.',
                email
            });
        }

        req.session.save((err) => {
            if (err) {
                return renderAuth(res, 'customer/forgot-password', {
                    error: 'Unable to continue right now. Please try again.',
                    email
                });
            }

            return res.redirect('/customer/forgot-password/verify');
        });
    } catch (error) {
        console.error('Forgot password error:', error);
        return renderAuth(res, 'customer/forgot-password', {
            error: 'Unable to continue right now. Please try again.',
            email
        });
    }
};

exports.getForgotVerify = (req, res) => {
    return renderVerify(req, res, {
        email: maskEmail(req.session.customerAuth.email),
        action: '/customer/forgot-password/verify',
        resendAction: '/customer/forgot-password/resend',
        title: 'Check your email',
        lede: RESET_CODE_SENT_MESSAGE,
        success: RESET_CODE_SENT_MESSAGE
    });
};

exports.postForgotVerify = async (req, res) => {
    const pending = req.session.customerAuth;
    const viewData = {
        email: maskEmail(pending.email),
        action: '/customer/forgot-password/verify',
        resendAction: '/customer/forgot-password/resend',
        title: 'Check your email',
        lede: RESET_CODE_SENT_MESSAGE
    };

    const validationError = firstValidationError(req);
    if (validationError) {
        return renderVerify(req, res, {
            ...viewData,
            error: validationError
        });
    }

    try {
        const result = await verifyOtp(
            pending.email,
            'PASSWORD_RESET',
            req.body.otp,
            pending
        );

        if (!result.ok) {
            return renderVerify(req, res, {
                ...viewData,
                error: result.message
            });
        }

        pending.verified = true;

        req.session.save((err) => {
            if (err) {
                return res.status(500).send('Could not continue password reset.');
            }

            return res.redirect('/customer/forgot-password/reset');
        });
    } catch (error) {
        console.error('Password reset OTP error:', error);
        return renderVerify(req, res, {
            ...viewData,
            error: 'Unable to verify that code right now. Please try again.'
        });
    }
};

exports.postForgotResend = async (req, res) => {
    const pending = req.session.customerAuth;
    const viewData = {
        email: maskEmail(pending.email),
        action: '/customer/forgot-password/verify',
        resendAction: '/customer/forgot-password/resend',
        title: 'Check your email',
        lede: RESET_CODE_SENT_MESSAGE
    };

    try {
        const user = await User.findOne({
            where: {
                email: pending.email,
                role: 'CUSTOMER',
                isActive: true
            }
        });

        if (!user) {
            return renderAuth(res, 'customer/forgot-password', {
                error: 'This email does not exist.',
                email: pending.email
            });
        }

        await sendAndStoreOtp(req, pending.email, 'PASSWORD_RESET');

        req.session.save(() => {
            return renderVerify(req, res, {
                ...viewData,
                success: 'A new verification code was sent.'
            });
        });
    } catch (error) {
        if (error.code === 'OTP_RATE_LIMIT') {
            return renderVerify(req, res, {
                ...viewData,
                error: error.retryAfter ? null : error.message,
                resendWait: error.retryAfter || resendWaitFor(req)
            });
        }

        console.error('Password reset resend error:', error);
        return renderVerify(req, res, {
            ...viewData,
            error: 'Unable to resend a verification code right now.'
        });
    }
};

exports.getResetPassword = (req, res) => {
    return renderAuth(res, 'customer/reset-password', {
        action: '/customer/forgot-password/reset',
        title: 'Set a new password',
        lede: 'Enter a new password for your customer account.',
        submitLabel: 'Update password'
    });
};

exports.postResetPassword = async (req, res) => {
    const pending = req.session.customerAuth;
    const viewData = {
        action: '/customer/forgot-password/reset',
        title: 'Set a new password',
        lede: 'Enter a new password for your customer account.',
        submitLabel: 'Update password'
    };

    const validationError = firstValidationError(req);
    if (validationError) {
        return renderAuth(res, 'customer/reset-password', {
            ...viewData,
            error: validationError
        });
    }

    try {
        const user = await User.findOne({
            where: {
                email: pending.email,
                role: 'CUSTOMER',
                isActive: true
            }
        });

        if (!user) {
            delete req.session.customerAuth;
            return res.redirect('/customer/login');
        }

        const passwordHash = await bcrypt.hash(req.body.password, BCRYPT_ROUNDS);
        await user.update({ passwordHash });

        delete req.session.customerAuth;

        req.session.save((err) => {
            if (err) {
                return res.redirect('/customer/login?message=password-reset');
            }

            return res.redirect('/customer/login?message=password-reset');
        });
    } catch (error) {
        console.error('Password reset error:', error);
        return renderAuth(res, 'customer/reset-password', {
            ...viewData,
            error: 'Unable to update your password right now. Please try again.'
        });
    }
};

exports.getDashboard = (req, res) => {
    return res.render('customer/dashboard', {
        user: req.session.user
    });
};
