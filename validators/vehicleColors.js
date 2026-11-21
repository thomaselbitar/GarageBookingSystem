const VEHICLE_COLORS = [
    'White',
    'Black',
    'Gray',
    'Silver',
    'Blue',
    'Red',
    'Brown',
    'Beige',
    'Green',
    'Gold',
    'Yellow',
    'Orange',
    'Purple'
];

const normalizeVehicleColor = (value) => {
    if (typeof value !== 'string') {
        return null;
    }

    const cleaned = value.trim().replace(/\s+/g, ' ').toLowerCase();
    if (!cleaned) {
        return null;
    }

    return VEHICLE_COLORS.find((color) => color.toLowerCase() === cleaned) || null;
};

module.exports = {
    VEHICLE_COLORS,
    normalizeVehicleColor
};
