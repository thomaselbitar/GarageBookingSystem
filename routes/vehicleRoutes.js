const express = require('express');
const router = express.Router();

const vehicleController = require('../controllers/customerVehicleController');
const { requireCustomerAuth } = require('../middleware/authMiddleware');
const { receiveVehicleImage } = require('../services/vehicleImage');
const { vehicleValidators } = require('../validators/vehicleValidators');

router.get(
    '/customer/vehicles',
    requireCustomerAuth,
    vehicleController.listVehicles
);

router.get(
    '/customer/vehicles/:id',
    requireCustomerAuth,
    vehicleController.showVehicle
);

router.post(
    '/customer/vehicles',
    requireCustomerAuth,
    receiveVehicleImage,
    vehicleValidators,
    vehicleController.createVehicle
);

router.post(
    '/customer/vehicles/:id/edit',
    requireCustomerAuth,
    receiveVehicleImage,
    vehicleValidators,
    vehicleController.updateVehicle
);

router.post(
    '/customer/vehicles/:id/delete',
    requireCustomerAuth,
    vehicleController.deleteVehicle
);

module.exports = router;
