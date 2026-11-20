const crypto = require('crypto');
const { Op } = require('sequelize');
const User = require('../models/User');

const STAFF_ROLES = [
    { value: 'ADMIN', label: 'Admin', slug: 'admin' },
    { value: 'MANAGER', label: 'Manager', slug: 'manager' },
    { value: 'WASHING', label: 'Washing', slug: 'washing' },
    { value: 'DETAILING', label: 'Detailing', slug: 'detailing' },
    { value: 'PAINTING', label: 'Painting', slug: 'painting' },
    { value: 'MECHANIC', label: 'Mechanic', slug: 'mechanic' }
];

const STAFF_ROLE_VALUES = STAFF_ROLES.map((role) => role.value);
const TEMP_PASSWORD_PATTERN = /^myPassword\d{4}$/;
const USERNAME_LIMIT = 100;
const SUFFIX_RESERVE = 6;

const roleByValue = (value) => STAFF_ROLES.find((role) => role.value === value) || null;

const firstNameSlug = (fullName) => {
    const first = String(fullName || '').trim().split(/\s+/)[0] || '';

    return first
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
};

const usernameBase = (role, fullName) => {
    const staffRole = roleByValue(role);
    const slug = firstNameSlug(fullName);

    if (!staffRole || slug.length < 2) {
        return null;
    }

    const prefix = `${staffRole.slug}.`;
    const maxSlug = USERNAME_LIMIT - prefix.length - SUFFIX_RESERVE;

    return `${prefix}${slug.slice(0, Math.max(maxSlug, 1))}`;
};

const generateTemporaryPassword = () => {
    const digits = crypto.randomInt(0, 10000).toString().padStart(4, '0');
    return `myPassword${digits}`;
};

const nextUsername = async (role, fullName) => {
    const base = usernameBase(role, fullName);

    if (!base) {
        return null;
    }

    const rows = await User.findAll({
        attributes: ['username'],
        where: {
            username: {
                [Op.startsWith]: base
            }
        }
    });

    let baseTaken = false;
    const takenSuffixes = new Set();

    rows.forEach((row) => {
        const username = String(row.username || '').toLowerCase();

        if (username === base) {
            baseTaken = true;
            return;
        }

        if (!username.startsWith(base)) {
            return;
        }

        const suffix = username.slice(base.length);
        if (/^[1-9]\d*$/.test(suffix)) {
            takenSuffixes.add(Number(suffix));
        }
    });

    if (!baseTaken) {
        return base;
    }

    let suffix = 2;
    while (takenSuffixes.has(suffix)) {
        suffix += 1;
        if (suffix > 999999) {
            throw new Error('No unique username is available.');
        }
    }

    return `${base}${suffix}`;
};

const isUsernameConflict = (error) => {
    if (!error || error.name !== 'SequelizeUniqueConstraintError') {
        return false;
    }

    return (error.errors || []).some((item) => item.path === 'username');
};

module.exports = {
    STAFF_ROLES,
    STAFF_ROLE_VALUES,
    TEMP_PASSWORD_PATTERN,
    roleByValue,
    firstNameSlug,
    usernameBase,
    generateTemporaryPassword,
    nextUsername,
    isUsernameConflict
};
