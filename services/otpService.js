const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { Op } = require('sequelize');
const Otp = require('../models/Otp');

const OTP_TTL_MS = 5 * 60 * 1000;
const MIN_SEND_INTERVAL_MS = 60 * 1000;
const MAX_SENDS_PER_HOUR = 5;
const MAX_VERIFY_ATTEMPTS = 5;
const BCRYPT_ROUNDS = 10;
const sendAttempts = new Map();

const generateOtp = () => {
    return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
};

const rateLimitError = (message, retryAfter = 0) => {
    const error = new Error(message);
    error.code = 'OTP_RATE_LIMIT';
    error.retryAfter = retryAfter;
    return error;
};

const getResendWaitSeconds = (otpSentAt) => {
    if (!otpSentAt) {
        return 0;
    }

    const remaining = MIN_SEND_INTERVAL_MS - (Date.now() - Number(otpSentAt));
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
};

const registerSendAttempt = (email, purpose) => {
    const key = `${purpose}:${email}`;
    const now = Date.now();
    const recent = (sendAttempts.get(key) || []).filter((time) => now - time < 60 * 60 * 1000);

    const lastSend = recent.length ? recent[recent.length - 1] : 0;
    if (lastSend && now - lastSend < MIN_SEND_INTERVAL_MS) {
        throw rateLimitError(
            'Please wait before requesting another code.',
            Math.ceil((MIN_SEND_INTERVAL_MS - (now - lastSend)) / 1000)
        );
    }

    if (recent.length >= MAX_SENDS_PER_HOUR) {
        throw rateLimitError('Too many code requests. Please try again later.');
    }

    recent.push(now);
    sendAttempts.set(key, recent);
};

const assertCanSendOtp = async (email, purpose) => {
    const recent = await Otp.findOne({
        where: {
            email,
            purpose,
            createdAt: {
                [Op.gt]: new Date(Date.now() - MIN_SEND_INTERVAL_MS)
            }
        },
        order: [['createdAt', 'DESC']]
    });

    if (recent) {
        throw rateLimitError(
            'Please wait before requesting another code.',
            Math.ceil((MIN_SEND_INTERVAL_MS - (Date.now() - recent.createdAt.getTime())) / 1000)
        );
    }

    const hourlyCount = await Otp.count({
        where: {
            email,
            purpose,
            createdAt: {
                [Op.gt]: new Date(Date.now() - 60 * 60 * 1000)
            }
        }
    });

    if (hourlyCount >= MAX_SENDS_PER_HOUR) {
        throw rateLimitError('Too many code requests. Please try again later.');
    }
};

const issueOtp = async (email, purpose) => {
    registerSendAttempt(email, purpose);
    await assertCanSendOtp(email, purpose);

    await Otp.update(
        { isUsed: true },
        {
            where: {
                email,
                purpose,
                isUsed: false
            }
        }
    );

    const code = generateOtp();
    const otpHash = await bcrypt.hash(code, BCRYPT_ROUNDS);

    await Otp.create({
        email,
        otpHash,
        purpose,
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
        isUsed: false
    });

    return code;
};

const verifyOtp = async (email, purpose, code, attemptState) => {
    const normalized = String(code || '').trim();

    attemptState.verifyAttempts = (attemptState.verifyAttempts || 0) + 1;

    if (attemptState.verifyAttempts > MAX_VERIFY_ATTEMPTS) {
        await Otp.update(
            { isUsed: true },
            { where: { email, purpose, isUsed: false } }
        );

        return {
            ok: false,
            message: 'Too many incorrect attempts. Please request a new code.'
        };
    }

    if (!/^\d{6}$/.test(normalized)) {
        return {
            ok: false,
            message: 'Enter the 6-digit code sent to your email.'
        };
    }

    const record = await Otp.findOne({
        where: {
            email,
            purpose,
            isUsed: false
        },
        order: [['createdAt', 'DESC']]
    });

    if (!record) {
        return {
            ok: false,
            message: 'Invalid or expired code.'
        };
    }

    if (record.expiresAt.getTime() <= Date.now()) {
        await record.update({ isUsed: true });
        return {
            ok: false,
            message: 'This code has expired. Please request a new one.'
        };
    }

    const match = await bcrypt.compare(normalized, record.otpHash);

    if (!match) {
        return {
            ok: false,
            message: 'Invalid or expired code.'
        };
    }

    await record.update({ isUsed: true });
    attemptState.verifyAttempts = 0;

    return { ok: true };
};

module.exports = {
    issueOtp,
    verifyOtp,
    registerSendAttempt,
    getResendWaitSeconds,
    OTP_TTL_MS,
    MIN_SEND_INTERVAL_MS,
    MAX_VERIFY_ATTEMPTS
};
