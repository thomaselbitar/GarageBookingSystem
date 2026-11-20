const { body, validationResult } = require('express-validator');

const passwordRule = body('password')
    .isLength({ min: 8, max: 72 })
    .withMessage('Password must be between 8 and 72 characters.');

const confirmPasswordRule = body('confirmPassword')
    .custom((value, { req }) => {
        if (value !== req.body.password) {
            throw new Error('Password confirmation does not match.');
        }
        return true;
    });

const emailRule = body('email')
    .trim()
    .toLowerCase()
    .isEmail()
    .withMessage('Please enter a valid email address.')
    .isLength({ max: 150 })
    .withMessage('Please enter a valid email address.');

const signupEmailValidators = [emailRule];

const loginValidators = [
    emailRule,
    body('password')
        .notEmpty()
        .withMessage('Please enter your email and password.')
];

const otpValidators = [
    body('otp')
        .trim()
        .matches(/^\d{6}$/)
        .withMessage('Enter the 6-digit code sent to your email.')
];

const passwordValidators = [passwordRule, confirmPasswordRule];

const firstValidationError = (req) => {
    const errors = validationResult(req);
    if (errors.isEmpty()) {
        return null;
    }

    return errors.array()[0].msg;
};

module.exports = {
    signupEmailValidators,
    loginValidators,
    otpValidators,
    passwordValidators,
    firstValidationError
};
