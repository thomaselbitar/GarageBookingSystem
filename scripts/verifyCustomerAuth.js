require('dotenv').config();

const bcrypt = require('bcrypt');
const sequelize = require('../config/database');
const User = require('../models/User');
const Otp = require('../models/Otp');
const { verifyOtp } = require('../services/otpService');

const BASE = 'http://localhost:3000';
const results = [];

const record = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const cookieJar = (setCookies = [], previous = '') => {
    const jar = new Map();

    previous.split(';').forEach((part) => {
        const [name, ...rest] = part.trim().split('=');
        if (name) {
            jar.set(name, rest.join('='));
        }
    });

    setCookies.forEach((header) => {
        const [pair] = header.split(';');
        const [name, ...rest] = pair.split('=');
        jar.set(name.trim(), rest.join('='));
    });

    return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
};

const request = async (path, { method = 'GET', body, cookie = '' } = {}) => {
    const response = await fetch(BASE + path, {
        method,
        redirect: 'manual',
        headers: {
            ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
            ...(cookie ? { Cookie: cookie } : {})
        },
        body
    });

    const setCookies = typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [];

    return {
        status: response.status,
        location: response.headers.get('location') || '',
        text: await response.text(),
        cookie: cookieJar(setCookies, cookie)
    };
};

const form = (data) => new URLSearchParams(data).toString();

const run = async () => {
    await sequelize.authenticate();

    const stamp = Date.now();
    const email = `cust.verify.${stamp}@example.com`;
    const password = 'TestPass123';
    const unknownEmail = `missing.${stamp}@example.com`;

    const signupPage = await request('/customer/signup');
    record('Signup page loads', signupPage.status === 200);

    const loginPage = await request('/customer/login');
    record('Customer login page loads', loginPage.status === 200);

    const forgotPage = await request('/customer/forgot-password');
    record('Forgot password page loads', forgotPage.status === 200);

    const staffLoginPage = await request('/login');
    record('Staff login page still loads', staffLoginPage.status === 200);

    const dashboardGuest = await request('/customer/dashboard');
    record(
        'Customer dashboard requires login',
        dashboardGuest.status === 302 && dashboardGuest.location.includes('/customer/login')
    );

    const invalidSignup = await request('/customer/signup', {
        method: 'POST',
        body: form({ email: 'not-an-email' })
    });
    record(
        'Invalid signup email is rejected',
        invalidSignup.status === 200 && invalidSignup.text.includes('valid email')
    );

    const smtpSignup = await request('/customer/signup', {
        method: 'POST',
        body: form({ email })
    });
    record(
        'Signup without SMTP stays on form',
        smtpSignup.status === 200 && smtpSignup.text.toLowerCase().includes('email')
    );

    await User.create({
        fullName: 'Verify Customer',
        email,
        username: null,
        passwordHash: await bcrypt.hash(password, 10),
        role: 'CUSTOMER',
        isActive: true
    });

    const duplicateSignup = await request('/customer/signup', {
        method: 'POST',
        body: form({ email })
    });
    record(
        'Duplicate customer email is rejected',
        duplicateSignup.status === 200 && duplicateSignup.text.toLowerCase().includes('already exists')
    );

    const badLogin = await request('/customer/login', {
        method: 'POST',
        body: form({ email, password: 'wrong-password' })
    });
    record(
        'Customer login rejects wrong password',
        badLogin.status === 200 && badLogin.text.toLowerCase().includes('invalid')
    );

    const goodLogin = await request('/customer/login', {
        method: 'POST',
        body: form({ email, password })
    });
    record(
        'Customer login succeeds',
        goodLogin.status === 302 && goodLogin.location.includes('/customer/dashboard')
    );

    const customerCookie = goodLogin.cookie;
    const customerDash = await request('/customer/dashboard', { cookie: customerCookie });
    record('Customer can open customer dashboard', customerDash.status === 200);

    const customerAdmin = await request('/admin/dashboard', { cookie: customerCookie });
    record(
        'Customer cannot open admin dashboard',
        customerAdmin.status === 302 && customerAdmin.location.includes('/customer/dashboard')
    );

    const expiredCode = '654321';
    await Otp.create({
        email,
        otpHash: await bcrypt.hash(expiredCode, 10),
        purpose: 'SIGNUP',
        expiresAt: new Date(Date.now() - 60 * 1000),
        isUsed: false
    });
    const expiredResult = await verifyOtp(email, 'SIGNUP', expiredCode, { verifyAttempts: 0 });
    record('Expired OTP is rejected', expiredResult.ok === false);

    const validCode = '112233';
    await Otp.create({
        email,
        otpHash: await bcrypt.hash(validCode, 10),
        purpose: 'PASSWORD_RESET',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        isUsed: false
    });
    const validResult = await verifyOtp(email, 'PASSWORD_RESET', validCode, { verifyAttempts: 0 });
    const reuseResult = await verifyOtp(email, 'PASSWORD_RESET', validCode, { verifyAttempts: 0 });
    record('Valid OTP can be used once', validResult.ok === true && reuseResult.ok === false);

    const invalidOtp = await verifyOtp(email, 'SIGNUP', '000000', { verifyAttempts: 0 });
    record('Invalid OTP is rejected', invalidOtp.ok === false);

    const forgotUnknown = await request('/customer/forgot-password', {
        method: 'POST',
        body: form({ email: unknownEmail })
    });
    record(
        'Forgot password rejects unknown email',
        forgotUnknown.status === 200 &&
        forgotUnknown.text.toLowerCase().includes('does not exist')
    );

    const staffLogin = await request('/login', {
        method: 'POST',
        body: form({
            username: process.env.ADMIN_USERNAME,
            password: process.env.ADMIN_PASSWORD
        })
    });
    record(
        'Admin staff login still works',
        staffLogin.status === 302 && staffLogin.location.includes('/admin/dashboard')
    );

    const staffCustomerDash = await request('/customer/dashboard', { cookie: staffLogin.cookie });
    record('Staff cannot open customer dashboard', staffCustomerDash.status === 403);

    const newPassword = 'ResetPass123';
    const customer = await User.findOne({ where: { email, role: 'CUSTOMER' } });
    await customer.update({ passwordHash: await bcrypt.hash(newPassword, 10) });
    const resetLogin = await request('/customer/login', {
        method: 'POST',
        body: form({ email, password: newPassword })
    });
    record(
        'Customer can log in after password update',
        resetLogin.status === 302 && resetLogin.location.includes('/customer/dashboard')
    );

    await User.destroy({ where: { email } });
    await Otp.destroy({ where: { email } });

    const failed = results.filter((item) => !item.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);

    if (failed.length) {
        process.exitCode = 1;
    }

    await sequelize.close();
};

run().catch((error) => {
    console.error('Verification script failed:', error.message);
    process.exitCode = 1;
    return sequelize.close();
});
