const Vehicle = require('../models/Vehicle');
const { firstValidationError, currentMaxYear } = require('../validators/vehicleValidators');
const { VEHICLE_COLORS } = require('../validators/vehicleColors');
const {
    MESSAGES,
    isStoredImagePath,
    inspectUpload,
    discardUpload,
    removeStoredImage
} = require('../services/vehicleImage');

const customerIdFrom = (req) => {
    const id = req.session && req.session.user && req.session.user.id;
    const number = Number(id);

    if (!Number.isInteger(number) || number < 1) {
        return null;
    }

    return number;
};

const parseVehicleId = (value) => {
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
        return null;
    }

    const id = Number(value);
    if (!Number.isSafeInteger(id)) {
        return null;
    }

    return id;
};

const presentVehicle = (vehicle) => ({
    id: vehicle.id,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    licensePlate: vehicle.licensePlate,
    color: vehicle.color,
    image: isStoredImagePath(vehicle.image) ? vehicle.image : ''
});

const vehicleFields = (req) => ({
    make: req.body.make,
    model: req.body.model,
    year: Number(req.body.year),
    licensePlate: req.body.licensePlate,
    color: req.body.color
});

const vehiclePagePath = (req) => {
    const id = req.params && req.params.id;
    if (typeof id === 'string' && /^[1-9]\d*$/.test(id)) {
        return `/customer/vehicles/${id}`;
    }

    return '/customer/vehicles';
};

const redirectVehicles = (req, res, destination = '/customer/vehicles') => {
    return req.session.save((err) => {
        if (err) {
            console.error('Could not save the vehicle message.');
            return res.status(500).send('Could not save the form message.');
        }

        return res.redirect(303, destination);
    });
};

const failValidation = async (req, res, message, destination = '/customer/vehicles') => {
    await discardUpload(req.file);
    req.session.vehicleError = message;
    return redirectVehicles(req, res, destination);
};

const findOwnedVehicle = async (req, res) => {
    const id = parseVehicleId(req.params.id);
    const customerId = customerIdFrom(req);

    if (!id || !customerId) {
        res.status(404).send('Vehicle not found.');
        return null;
    }

    const vehicle = await Vehicle.findOne({
        where: {
            id,
            customerId
        }
    });

    if (!vehicle) {
        res.status(404).send('Vehicle not found.');
        return null;
    }

    return vehicle;
};

exports.listVehicles = async (req, res) => {
    try {
        const customerId = customerIdFrom(req);
        if (!customerId) {
            return res.status(403).send('Access Denied');
        }

        const rows = await Vehicle.findAll({
            where: { customerId },
            order: [['createdAt', 'DESC'], ['id', 'DESC']]
        });
        const formError = req.session.vehicleError || null;
        const formNotice = req.session.vehicleNotice || null;
        delete req.session.vehicleError;
        delete req.session.vehicleNotice;

        const renderPage = () => {
            res.render('customer/vehicles', {
                user: req.session.user,
                vehicles: rows.map(presentVehicle),
                formError,
                formNotice,
                maxYear: currentMaxYear(),
                vehicleColors: VEHICLE_COLORS
            });
        };

        if (!formError && !formNotice) {
            return renderPage();
        }

        return req.session.save((err) => {
            if (err) {
                console.error('Could not clear the vehicle message.');
            }

            return renderPage();
        });
    } catch (error) {
        console.error('Could not load vehicles:', error);
        return res.status(500).send('Could not load your vehicles.');
    }
};

exports.showVehicle = async (req, res) => {
    try {
        const vehicle = await findOwnedVehicle(req, res);
        if (!vehicle) {
            return;
        }

        const formError = req.session.vehicleError || null;
        const formNotice = req.session.vehicleNotice || null;
        delete req.session.vehicleError;
        delete req.session.vehicleNotice;

        const renderPage = () => {
            res.render('customer/vehicle', {
                user: req.session.user,
                vehicle: presentVehicle(vehicle),
                formError,
                formNotice,
                maxYear: currentMaxYear(),
                vehicleColors: VEHICLE_COLORS
            });
        };

        if (!formError && !formNotice) {
            return renderPage();
        }

        return req.session.save((err) => {
            if (err) {
                console.error('Could not clear the vehicle message.');
            }

            return renderPage();
        });
    } catch (error) {
        console.error('Could not load the vehicle:', error);
        return res.status(500).send('Could not load the vehicle.');
    }
};

exports.createVehicle = async (req, res) => {
    try {
        const customerId = customerIdFrom(req);
        if (!customerId) {
            await discardUpload(req.file);
            return res.status(403).send('Access Denied');
        }

        const validationError = firstValidationError(req);
        if (validationError) {
            return failValidation(req, res, validationError);
        }

        if (!req.file) {
            req.session.vehicleError = MESSAGES.required;
            return redirectVehicles(req, res);
        }

        const checked = await inspectUpload(req.file);
        if (!checked.ok) {
            return failValidation(req, res, checked.message);
        }

        await Vehicle.create({
            customerId,
            ...vehicleFields(req),
            image: checked.publicPath
        });

        req.session.vehicleNotice = 'Vehicle added.';
        return redirectVehicles(req, res);
    } catch (error) {
        await discardUpload(req.file);
        console.error('Could not add the vehicle:', error);
        return res.status(500).send('Could not add the vehicle.');
    }
};

exports.updateVehicle = async (req, res) => {
    try {
        const vehicle = await findOwnedVehicle(req, res);
        if (!vehicle) {
            await discardUpload(req.file);
            return;
        }

        const validationError = firstValidationError(req);
        if (validationError) {
            return failValidation(req, res, validationError, vehiclePagePath(req));
        }

        const fields = vehicleFields(req);

        if (!req.file) {
            await vehicle.update(fields);
            req.session.vehicleNotice = 'Vehicle updated.';
            return redirectVehicles(req, res, vehiclePagePath(req));
        }

        const checked = await inspectUpload(req.file);
        if (!checked.ok) {
            return failValidation(req, res, checked.message, vehiclePagePath(req));
        }

        const previousImage = vehicle.image;
        await vehicle.update({
            ...fields,
            image: checked.publicPath
        });
        await removeStoredImage(previousImage);

        req.session.vehicleNotice = 'Vehicle updated.';
        return redirectVehicles(req, res, vehiclePagePath(req));
    } catch (error) {
        await discardUpload(req.file);
        console.error('Could not update the vehicle:', error);
        return res.status(500).send('Could not update the vehicle.');
    }
};

exports.deleteVehicle = async (req, res) => {
    try {
        const vehicle = await findOwnedVehicle(req, res);
        if (!vehicle) {
            return;
        }

        const image = vehicle.image;
        await vehicle.destroy();
        await removeStoredImage(image);

        req.session.vehicleNotice = 'Vehicle deleted.';
        return redirectVehicles(req, res);
    } catch (error) {
        console.error('Could not delete the vehicle:', error);
        return res.status(500).send('Could not delete the vehicle.');
    }
};
