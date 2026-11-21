const Vehicle = require('../models/Vehicle');

const PERMITTED_LETTERS = 'ABCDGJMNOPRSTZ';
const PLATE_PATTERN = new RegExp(`^[${PERMITTED_LETTERS}]\\d{2,7}$`);

const INVALID_PLATE_MESSAGE = 'Enter a valid Lebanese license plate.';
const DUPLICATE_PLATE_MESSAGE = 'This license plate is already registered.';

const normalizeLicensePlate = (value) => {
    if (typeof value !== 'string') {
        return null;
    }

    const compact = value.toUpperCase().replace(/[\s-]+/g, '');
    const match = compact.match(PLATE_PATTERN);
    if (!match) {
        return null;
    }

    return `${match[0].charAt(0)} ${match[0].slice(1)}`;
};

const isLicensePlateTaken = async (normalized, excludeId = null) => {
    const vehicles = await Vehicle.findAll({
        attributes: ['id', 'licensePlate']
    });

    return vehicles.some((vehicle) => {
        if (excludeId && Number(vehicle.id) === Number(excludeId)) {
            return false;
        }

        return normalizeLicensePlate(vehicle.licensePlate) === normalized;
    });
};

module.exports = {
    PERMITTED_LETTERS,
    INVALID_PLATE_MESSAGE,
    DUPLICATE_PLATE_MESSAGE,
    normalizeLicensePlate,
    isLicensePlateTaken
};
