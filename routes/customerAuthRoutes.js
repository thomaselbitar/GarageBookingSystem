const express = require('express');
const router = express.Router();

const customerAuthController = require('../controllers/customerAuthController');
const customerProfileController = require('../controllers/customerProfileController');
const {
    requireCustomerAuth,
    redirectIfAuthenticated
} = require('../middleware/authMiddleware');
const {
    signupEmailValidators,
    loginValidators,
    otpValidators,
    passwordValidators,
    profilePasswordValidators
} = require('../validators/customerAuthValidators');

router.get(
    '/customer/signup',
    redirectIfAuthenticated,
    customerAuthController.getSignup
);
router.post(
    '/customer/signup',
    redirectIfAuthenticated,
    signupEmailValidators,
    customerAuthController.postSignup
);

router.get(
    '/customer/signup/verify',
    customerAuthController.requirePendingSignup,
    customerAuthController.getSignupVerify
);
router.post(
    '/customer/signup/verify',
    customerAuthController.requirePendingSignup,
    otpValidators,
    customerAuthController.postSignupVerify
);
router.post(
    '/customer/signup/resend',
    customerAuthController.requirePendingSignup,
    customerAuthController.postSignupResend
);

router.get(
    '/customer/signup/password',
    customerAuthController.requireVerifiedSignup,
    customerAuthController.getSignupPassword
);
router.post(
    '/customer/signup/password',
    customerAuthController.requireVerifiedSignup,
    passwordValidators,
    customerAuthController.postSignupPassword
);

router.get(
    '/customer/login',
    redirectIfAuthenticated,
    customerAuthController.getLogin
);
router.post(
    '/customer/login',
    redirectIfAuthenticated,
    loginValidators,
    customerAuthController.postLogin
);

router.get(
    '/customer/forgot-password',
    redirectIfAuthenticated,
    customerAuthController.getForgotPassword
);
router.post(
    '/customer/forgot-password',
    redirectIfAuthenticated,
    signupEmailValidators,
    customerAuthController.postForgotPassword
);

router.get(
    '/customer/forgot-password/verify',
    customerAuthController.requirePendingReset,
    customerAuthController.getForgotVerify
);
router.post(
    '/customer/forgot-password/verify',
    customerAuthController.requirePendingReset,
    otpValidators,
    customerAuthController.postForgotVerify
);
router.post(
    '/customer/forgot-password/resend',
    customerAuthController.requirePendingReset,
    customerAuthController.postForgotResend
);

router.get(
    '/customer/forgot-password/reset',
    customerAuthController.requireVerifiedReset,
    customerAuthController.getResetPassword
);
router.post(
    '/customer/forgot-password/reset',
    customerAuthController.requireVerifiedReset,
    passwordValidators,
    customerAuthController.postResetPassword
);

router.get(
    '/customer/dashboard',
    requireCustomerAuth,
    customerAuthController.getDashboard
);

router.get(
    '/customer/profile',
    requireCustomerAuth,
    customerProfileController.getProfile
);
router.post(
    '/customer/profile/password',
    requireCustomerAuth,
    profilePasswordValidators,
    customerProfileController.updatePassword
);

module.exports = router;
