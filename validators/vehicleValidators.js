const { body, validationResult } = require('express-validator');
const {
    normalizeLicensePlate,
    isLicensePlateTaken,
    INVALID_PLATE_MESSAGE,
    DUPLICATE_PLATE_MESSAGE
} = require('./licensePlate');
const { normalizeVehicleColor } = require('./vehicleColors');

const currentMaxYear = () => new Date().getFullYear() + 1;

const text = (field) => body(field)
    .customSanitizer((value) => (typeof value === 'string' ? value : ''))
    .trim()
    .customSanitizer((value) => value.replace(/\s+/g, ' '));

const nameRule = (field, label) => text(field)
    .notEmpty()
    .withMessage(`Please enter the ${label}.`)
    .isLength({ max: 50 })
    .withMessage(`${label.charAt(0).toUpperCase()}${label.slice(1)} must be 50 characters or fewer.`)
    .matches(/^[\p{L}\p{M}0-9][\p{L}\p{M}0-9 .'-]*$/u)
    .withMessage(`${label.charAt(0).toUpperCase()}${label.slice(1)} can only include letters, numbers, spaces, apostrophes, periods, and hyphens.`);

const vehicleValidators = [
    nameRule('make', 'make'),
    nameRule('model', 'model'),
    text('year')
        .custom((value) => {
            if (!/^\d{4}$/.test(value)) {
                return false;
            }

            const year = Number(value);
            return year >= 1900 && year <= currentMaxYear();
        })
        .withMessage(() => `Enter a year from 1900 to ${currentMaxYear()}.`)
        .toInt(),
    body('color')
        .customSanitizer((value) => (typeof value === 'string' ? value : ''))
        .trim()
        .notEmpty()
        .withMessage('Please choose a color.')
        .bail()
        .customSanitizer((value) => normalizeVehicleColor(value) || value)
        .custom((value) => normalizeVehicleColor(value) !== null)
        .withMessage('Choose a color from the list.'),
    body('licensePlate')
        .customSanitizer((value) => (typeof value === 'string' ? value : ''))
        .trim()
        .notEmpty()
        .withMessage('Please enter the license plate.')
        .bail()
        .customSanitizer((value) => normalizeLicensePlate(value) || value)
        .custom(async (value, { req }) => {
            const normalized = normalizeLicensePlate(value);
            if (!normalized) {
                throw new Error(INVALID_PLATE_MESSAGE);
            }

            const rawId = req.params && req.params.id;
            const excludeId = typeof rawId === 'string' && /^[1-9]\d*$/.test(rawId)
                ? Number(rawId)
                : null;
            const taken = await isLicensePlateTaken(normalized, excludeId);
            if (taken) {
                throw new Error(DUPLICATE_PLATE_MESSAGE);
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
    vehicleValidators,
    firstValidationError,
    currentMaxYear
};
