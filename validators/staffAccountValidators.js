const { body, validationResult } = require('express-validator');
const {
    STAFF_ROLE_VALUES,
    firstNameSlug
} = require('../services/staffAccountService');

const staffAccountValidators = [
    body('fullName')
        .customSanitizer((value) => (typeof value === 'string' ? value : ''))
        .trim()
        .customSanitizer((value) => value.replace(/\s+/g, ' '))
        .notEmpty()
        .withMessage('Please enter the employee full name.')
        .isLength({ min: 2, max: 100 })
        .withMessage('Full name must be between 2 and 100 characters.')
        .matches(/^[\p{L}\p{M}][\p{L}\p{M}0-9 .'-]*$/u)
        .withMessage('Full name can only include letters, numbers, spaces, apostrophes, periods, and hyphens.')
        .custom((value) => {
            if (firstNameSlug(value).length < 2) {
                throw new Error('Enter a full name that starts with a first name.');
            }

            return true;
        }),
    body('role')
        .customSanitizer((value) => (typeof value === 'string' ? value.trim() : ''))
        .isIn(STAFF_ROLE_VALUES)
        .withMessage('Select a staff role.')
];

const employeePasswordValidators = [
    body('password')
        .customSanitizer((value) => (typeof value === 'string' ? value : ''))
        .isLength({ min: 8, max: 72 })
        .withMessage('Password must be between 8 and 72 characters.'),
    body('confirmPassword')
        .customSanitizer((value) => (typeof value === 'string' ? value : ''))
        .custom((value, { req }) => {
            if (value !== req.body.password) {
                throw new Error('Password confirmation does not match.');
            }

            return true;
        })
];

const firstValidationError = (req) => {
    const errors = validationResult(req);
    if (errors.isEmpty()) {
        return null;
    }

    return errors.array()[0].msg;
};

module.exports = {
    staffAccountValidators,
    employeePasswordValidators,
    firstValidationError
};
