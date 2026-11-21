require('dotenv').config();

const bcrypt = require('bcrypt');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const User = require('../models/User');
const {
    firstNameSlug,
    usernameBase,
    generateTemporaryPassword,
    TEMP_PASSWORD_PATTERN
} = require('../services/staffAccountService');

const BASE = 'http://localhost:3000';
const marker = `V${Date.now()}`;
const results = [];
const createdIds = [];

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
        cache: response.headers.get('cache-control') || '',
        text: await response.text(),
        cookie: cookieJar(setCookies, cookie)
    };
};

const form = (data) => new URLSearchParams(data).toString();

const decode = (value) => value
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

const inputField = (html, id) => {
    const match = html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`));
    if (!match) {
        return null;
    }

    const tag = match[0];
    const value = tag.match(/value="([^"]*)"/);
    const role = tag.match(/data-role="([^"]*)"/);

    return {
        value: decode(value ? value[1] : ''),
        role: role ? role[1] : ''
    };
};

const rankUsername = (username, base) => {
    if (username === base) {
        return 1;
    }

    if (!username.startsWith(base)) {
        return null;
    }

    const suffix = username.slice(base.length);
    return /^[1-9]\d*$/.test(suffix) ? Number(suffix) : null;
};

const cleanup = async () => {
    const where = {
        [Op.or]: [
            { fullName: { [Op.like]: `% ${marker}` } },
            { email: `customer.${marker}@example.com` },
            { fullName: 'A'.repeat(101) }
        ]
    };

    if (createdIds.length) {
        where[Op.or].push({ id: createdIds });
    }

    await User.destroy({ where });
};

const run = async () => {
    await sequelize.authenticate();

    const passwords = Array.from({ length: 40 }, () => generateTemporaryPassword());
    const passwordNumbers = passwords.map((password) => Number(password.slice(-4)));
    record(
        'Generated passwords use myPassword plus 4 digits',
        passwords.every((password) => TEMP_PASSWORD_PATTERN.test(password))
    );
    record(
        'Generated passwords are not a single repeating or sequential series',
        new Set(passwords).size > 1 &&
            !passwordNumbers.every((value, index) => index === 0 || value === passwordNumbers[index - 1] + 1)
    );
    record('First name slug removes spaces and symbols', firstNameSlug('  Jean-Luc!! ') === 'jeanluc');
    record('First name slug removes accents', firstNameSlug('José') === 'jose');
    record('First name slug keeps letters and digits', firstNameSlug("O'Brien") === 'obrien');
    record('Username base uses the role and first name', usernameBase('MANAGER', 'Ali Hassan') === 'manager.ali');
    record('Customer role is not a staff username', usernameBase('CUSTOMER', 'Ali Hassan') === null);

    const columns = await sequelize.getQueryInterface().describeTable('users');
    const columnNames = Object.keys(columns).sort();
    record(
        'users table still has the existing columns',
        JSON.stringify(columnNames) === JSON.stringify([
            'created_at',
            'email',
            'full_name',
            'id',
            'is_active',
            'password_hash',
            'role',
            'updated_at',
            'username'
        ].sort())
    );

    const tables = await sequelize.getQueryInterface().showAllTables();
    const tableNames = tables.map((table) => (typeof table === 'string' ? table : table.tableName || table.table_name));
    record('No extra account table was created', tableNames.includes('users') && !tableNames.includes('employees') && !tableNames.includes('staff_accounts'));

    const staffLoginPage = await request('/login');
    record('Staff login page still loads', staffLoginPage.status === 200 && staffLoginPage.text.includes('Username'));

    const customerLoginPage = await request('/customer/login');
    record('Customer login page still loads', customerLoginPage.status === 200);

    const guestDashboard = await request('/admin/dashboard');
    record(
        'Guests cannot open the admin dashboard',
        guestDashboard.status === 302 && guestDashboard.location.includes('/login')
    );

    const guestCreate = await request('/admin/staff', {
        method: 'POST',
        body: form({ fullName: `Guest ${marker}`, role: 'MANAGER' })
    });
    record(
        'Guests cannot submit staff account creation',
        guestCreate.status === 302 && guestCreate.location.includes('/login')
    );

    const adminLogin = await request('/login', {
        method: 'POST',
        body: form({
            username: process.env.ADMIN_USERNAME,
            password: process.env.ADMIN_PASSWORD
        })
    });
    record(
        'Existing admin can still log in',
        adminLogin.status === 302 && adminLogin.location.includes('/admin/dashboard')
    );

    let adminCookie = adminLogin.cookie;
    const dashboard = await request('/admin/dashboard', { cookie: adminCookie });
    adminCookie = dashboard.cookie;
    record('Admin dashboard opens employee management from the sidebar', dashboard.status === 200 && dashboard.text.includes('href="/admin/employees"') && dashboard.text.includes('Manage employees') && !dashboard.text.includes('name="fullName"'));

    const ownDirectory = await request('/admin/employees', { cookie: adminCookie });
    adminCookie = ownDirectory.cookie;
    record(
        'The signed-in account is hidden from the employee list',
        ownDirectory.status === 200 && !ownDirectory.text.includes(`<small>${process.env.ADMIN_USERNAME}</small>`)
    );
    record('Existing dashboard content is still present', dashboard.text.includes('Welcome back') && dashboard.text.includes('Open bookings') && !dashboard.text.includes('Manage managers'));

    const staffShortcut = await request('/admin/staff', { cookie: adminCookie });
    adminCookie = staffShortcut.cookie;
    record(
        'Create staff opens its own screen',
        staffShortcut.status === 200 &&
            staffShortcut.text.includes('Create staff account') &&
            staffShortcut.text.includes('name="fullName"') &&
            staffShortcut.text.includes('action="/admin/staff"') &&
            !staffShortcut.text.includes('Open bookings')
    );
    record(
        'Role list contains the six staff roles only',
        ['ADMIN', 'MANAGER', 'WASHING', 'DETAILING', 'PAINTING', 'MECHANIC']
            .every((role) => staffShortcut.text.includes(`value="${role}"`)) &&
            !staffShortcut.text.includes('value="CUSTOMER"')
    );

    const accounts = [
        { key: 'admin', fullName: `Thomas ${marker}`, submittedName: `Thomas ${marker}`, role: 'ADMIN', label: 'Admin', base: 'admin.thomas' },
        { key: 'manager', fullName: `Ali ${marker}`, submittedName: `Ali ${marker}`, role: 'MANAGER', label: 'Manager', base: 'manager.ali' },
        { key: 'manager-2', fullName: `Ali ${marker}`, submittedName: `Ali ${marker}`, role: 'MANAGER', label: 'Manager', base: 'manager.ali' },
        { key: 'washing', fullName: `Ali ${marker}`, submittedName: `Ali ${marker}`, role: 'WASHING', label: 'Washing', base: 'washing.ali' },
        { key: 'detailing', fullName: `John ${marker}`, submittedName: `John ${marker}`, role: 'DETAILING', label: 'Detailing', base: 'detailing.john' },
        { key: 'painting', fullName: `John ${marker}`, submittedName: `  John   ${marker}  `, role: 'PAINTING', label: 'Painting', base: 'painting.john' },
        { key: 'mechanic', fullName: `Ali ${marker}`, submittedName: `Ali ${marker}`, role: 'MECHANIC', label: 'Mechanic', base: 'mechanic.ali' },
        { key: 'hyphen', fullName: `Jean-Luc ${marker}`, submittedName: `Jean-Luc ${marker}`, role: 'PAINTING', label: 'Painting', base: 'painting.jeanluc' },
        { key: 'accent', fullName: `José ${marker}`, submittedName: `José ${marker}`, role: 'DETAILING', label: 'Detailing', base: 'detailing.jose' }
    ];

    const made = [];

    for (const account of accounts) {
        const before = await User.count();
        const post = await request('/admin/staff', {
            method: 'POST',
            cookie: adminCookie,
            body: form({ fullName: account.submittedName, role: account.role })
        });
        adminCookie = post.cookie;

        const redirected = post.status === 303 && post.location.includes('/admin/staff/created');
        record(`${account.role} ${account.key} creation redirects to the one-time page`, redirected, redirected ? '' : `status ${post.status}`);
        if (!redirected) {
            continue;
        }

        const page = await request('/admin/staff/created', { cookie: adminCookie });
        adminCookie = page.cookie;
        const username = inputField(page.text, 'cred-username');
        const fullName = inputField(page.text, 'cred-fullname');
        const role = inputField(page.text, 'cred-role');
        const password = inputField(page.text, 'cred-password');
        const parsed = Boolean(username && fullName && role && password);

        record(
            `${account.key} credentials are shown once`,
            parsed &&
                page.status === 200 &&
                page.text.includes('Staff account created') &&
                page.text.includes('Share this temporary password securely') &&
                page.cache.includes('no-store'),
            parsed ? username.value : `status ${page.status}`
        );

        if (!parsed) {
            continue;
        }

        const usernameOk = new RegExp(`^${account.base}\\d*$`).test(username.value);
        record(`${account.key} username matches ${account.base}`, usernameOk, username.value);
        record(`${account.key} password format`, TEMP_PASSWORD_PATTERN.test(password.value));
        record(`${account.key} displayed name and role`, fullName.value === account.fullName && role.value === account.label && role.role === account.role);

        const user = await User.findOne({ where: { username: username.value } });
        if (user) {
            createdIds.push(user.id);
        }

        const hashOk = Boolean(
            user &&
            user.passwordHash &&
            user.passwordHash !== password.value &&
            user.passwordHash.startsWith('$2') &&
            !user.passwordHash.includes('myPassword') &&
            await bcrypt.compare(password.value, user.passwordHash)
        );
        record(
            `${account.key} password is stored as a bcrypt hash`,
            hashOk && user.fullName === account.fullName && user.role === account.role && user.isActive === true && user.email == null
        );
        record(`${account.key} plain password is not stored on the user row`, user && !JSON.stringify(user.toJSON()).includes(password.value));
        record(`${account.key} account count increased by one`, await User.count() === before + 1);

        const again = await request('/admin/staff/created', { cookie: adminCookie });
        adminCookie = again.cookie;
        record(
            `${account.key} refresh does not show the password again`,
            again.status === 200 &&
                again.text.includes('Credentials no longer available') &&
                !again.text.includes(password.value) &&
                !again.text.includes('id="cred-password"')
        );

        const back = await request('/admin/dashboard', { cookie: adminCookie });
        adminCookie = back.cookie;
        record(
            `${account.key} dashboard does not reveal the password`,
            back.status === 200 && !back.text.includes(password.value)
        );

        const directory = await request(`/admin/employees?type=${account.role}`, { cookie: adminCookie });
        adminCookie = directory.cookie;
        record(
            `${account.key} is listed under ${account.label}`,
            directory.status === 200 &&
                directory.text.includes(account.fullName) &&
                directory.text.includes(username.value) &&
                directory.text.includes('Create staff') &&
                !directory.text.includes(password.value)
        );

        const login = await request('/login', {
            method: 'POST',
            body: form({ username: username.value, password: password.value })
        });
        const expectedLocation = account.role === 'ADMIN'
            ? '/admin/dashboard'
            : account.role === 'MANAGER'
                ? '/manager/dashboard'
                : '/dashboard';
        const landedOnManagerConsole = login.location.includes('/manager/');
        record(
            `${account.key} can log in with the generated credentials`,
            login.status === 302 &&
                login.location.includes(expectedLocation) &&
                (account.role === 'MANAGER' || !landedOnManagerConsole)
        );

        const wrong = await request('/login', {
            method: 'POST',
            body: form({ username: username.value, password: `${password.value}9` })
        });
        record(
            `${account.key} rejects a wrong password`,
            wrong.status === 200 && wrong.text.includes('Invalid username or password.')
        );

        if (login.status === 302) {
            const protectedPage = await request('/admin/dashboard', { cookie: login.cookie });
            if (account.role === 'ADMIN') {
                record(
                    `${account.key} session opens the admin dashboard`,
                    protectedPage.status === 200 && protectedPage.text.includes(account.fullName)
                );
            } else {
                record(
                    `${account.key} session is blocked from admin account creation`,
                    protectedPage.status === 403 && protectedPage.text.includes('Access Denied')
                );
            }
        }

        made.push({
            ...account,
            username: username.value,
            password: password.value,
            loginCookie: login.cookie
        });
    }

    const managers = made.filter((account) => account.key.startsWith('manager'));
    if (managers.length === 2) {
        const firstRank = rankUsername(managers[0].username, 'manager.ali');
        const secondRank = rankUsername(managers[1].username, 'manager.ali');
        record(
            'Duplicate manager names receive unique numbered usernames',
            managers[0].username !== managers[1].username &&
                firstRank !== null &&
                secondRank !== null &&
                secondRank > firstRank,
            `${managers[0].username}, ${managers[1].username}`
        );
    } else {
        record('Duplicate manager names receive unique numbered usernames', false, 'both manager accounts were not created');
    }

    const usernames = made.map((account) => account.username);
    record('All generated usernames are unique', new Set(usernames).size === usernames.length && usernames.length === accounts.length);

    const passwordTarget = made.find((account) => account.key === 'manager');
    if (passwordTarget) {
        const employee = await User.findOne({ where: { username: passwordTarget.username } });
        const detail = await request(`/admin/employees/${employee.id}`, { cookie: adminCookie });
        adminCookie = detail.cookie;
        record(
            'Employee screen shows account data and a password form',
            detail.status === 200 &&
                detail.text.includes(passwordTarget.fullName) &&
                detail.text.includes(passwordTarget.username) &&
                detail.text.includes('name="password"') &&
                detail.text.includes('readonly') &&
                !detail.text.includes(passwordTarget.password)
        );

        const nextPassword = 'UpdatedPass123';
        const update = await request(`/admin/employees/${employee.id}/password`, {
            method: 'POST',
            cookie: adminCookie,
            body: form({ password: nextPassword, confirmPassword: nextPassword })
        });
        adminCookie = update.cookie;
        const updatedPage = update.status === 303
            ? await request(`/admin/employees/${employee.id}`, { cookie: adminCookie })
            : update;
        adminCookie = updatedPage.cookie || adminCookie;
        const reloaded = await User.findByPk(employee.id);
        record(
            'Admin can update only the employee password',
            update.status === 303 &&
                updatedPage.text.includes('Password updated') &&
                reloaded.fullName === passwordTarget.fullName &&
                reloaded.username === passwordTarget.username &&
                reloaded.role === 'MANAGER' &&
                reloaded.passwordHash !== nextPassword &&
                await bcrypt.compare(nextPassword, reloaded.passwordHash)
        );

        const newLogin = await request('/login', {
            method: 'POST',
            body: form({ username: passwordTarget.username, password: nextPassword })
        });
        const oldLogin = await request('/login', {
            method: 'POST',
            body: form({ username: passwordTarget.username, password: passwordTarget.password })
        });
        record('Employee can log in with the updated password', newLogin.status === 302);
        record('The previous password no longer works', oldLogin.status === 200);

        const rejected = await request(`/admin/employees/${employee.id}/password`, {
            method: 'POST',
            cookie: adminCookie,
            body: form({ password: 'short', confirmPassword: 'short' })
        });
        adminCookie = rejected.cookie;
        const rejectedPage = rejected.status === 303
            ? await request(`/admin/employees/${employee.id}`, { cookie: adminCookie })
            : rejected;
        adminCookie = rejectedPage.cookie || adminCookie;
        const unchanged = await User.findByPk(employee.id);
        record(
            'A short password is rejected and the saved password stays',
            rejected.status === 303 &&
                rejectedPage.text.includes('Password must be between 8 and 72 characters.') &&
                await bcrypt.compare(nextPassword, unchanged.passwordHash)
        );

        const seededAdmin = await User.findOne({ where: { username: process.env.ADMIN_USERNAME } });
        const ownPage = await request(`/admin/employees/${seededAdmin.id}`, { cookie: adminCookie });
        record(
            'The signed-in account cannot be opened for editing',
            ownPage.status === 302 && ownPage.location.includes('/admin/employees')
        );
        adminCookie = ownPage.cookie || adminCookie;

        const activePage = await request(`/admin/employees/${employee.id}`, { cookie: adminCookie });
        adminCookie = activePage.cookie;
        const deactivate = await request(`/admin/employees/${employee.id}/status`, {
            method: 'POST',
            cookie: adminCookie,
            body: form({ active: 'false' })
        });
        adminCookie = deactivate.cookie;
        const inactivePage = deactivate.status === 303
            ? await request(`/admin/employees/${employee.id}`, { cookie: adminCookie })
            : deactivate;
        adminCookie = inactivePage.cookie || adminCookie;
        const inactiveUser = await User.findByPk(employee.id);
        const inactiveLogin = await request('/login', {
            method: 'POST',
            body: form({ username: passwordTarget.username, password: nextPassword })
        });
        const blockedSession = await request('/admin/dashboard', { cookie: newLogin.cookie });
        record(
            'Deactivated account cannot log in',
            deactivate.status === 303 &&
                inactiveUser.isActive === false &&
                inactivePage.text.includes('Inactive') &&
                inactivePage.text.includes('id="status-popup"') &&
                inactiveLogin.status === 200 &&
                inactiveLogin.text.includes('Your account is deactivated. Need help') &&
                inactiveLogin.text.includes('+961 81690063') &&
                blockedSession.status === 302 &&
                blockedSession.location.includes('/login?deactivated=1')
        );

        const reactivate = await request(`/admin/employees/${employee.id}/status`, {
            method: 'POST',
            cookie: adminCookie,
            body: form({ active: 'true' })
        });
        adminCookie = reactivate.cookie;
        const restored = await User.findByPk(employee.id);
        const restoredLogin = await request('/login', {
            method: 'POST',
            body: form({ username: passwordTarget.username, password: nextPassword })
        });
        record(
            'Activated account can log in again',
            reactivate.status === 303 && restored.isActive === true && restoredLogin.status === 302
        );
    } else {
        record('Admin can update only the employee password', false, 'manager account was not available');
    }

    const createdAdmin = made.find((account) => account.key === 'admin');
    if (createdAdmin) {
        const nested = await request('/admin/staff', {
            method: 'POST',
            cookie: createdAdmin.loginCookie,
            body: form({ fullName: `Sam ${marker}`, role: 'MECHANIC' })
        });
        const nestedPage = nested.status === 303
            ? await request('/admin/staff/created', { cookie: nested.cookie })
            : null;
        const nestedUsername = nestedPage ? inputField(nestedPage.text, 'cred-username') : null;
        const nestedPassword = nestedPage ? inputField(nestedPage.text, 'cred-password') : null;
        const nestedUser = nestedUsername
            ? await User.findOne({ where: { username: nestedUsername.value } })
            : null;

        if (nestedUser) {
            createdIds.push(nestedUser.id);
        }

        const nestedLogin = nestedUsername && nestedPassword
            ? await request('/login', {
                method: 'POST',
                body: form({ username: nestedUsername.value, password: nestedPassword.value })
            })
            : null;

        record(
            'A newly created admin can create a mechanic',
            Boolean(
                nestedUser &&
                nestedUser.role === 'MECHANIC' &&
                /^mechanic\.sam\d*$/.test(nestedUser.username) &&
                nestedPassword &&
                TEMP_PASSWORD_PATTERN.test(nestedPassword.value) &&
                await bcrypt.compare(nestedPassword.value, nestedUser.passwordHash) &&
                nestedLogin &&
                nestedLogin.status === 302
            ),
            nestedUser ? nestedUser.username : 'account was not created'
        );

        if (nestedPage && nestedPassword) {
            const nestedAgain = await request('/admin/staff/created', { cookie: nestedPage.cookie });
            record(
                'Mechanic password created by the new admin is also shown only once',
                !nestedAgain.text.includes(nestedPassword.value)
            );
        }
    } else {
        record('A newly created admin can create a mechanic', false, 'created admin was not available');
    }

    const manager = made.find((account) => account.key === 'manager');
    if (manager) {
        const blockedName = `Blocked ${marker}`;
        const before = await User.count({ where: { fullName: blockedName } });
        const page = await request('/admin/dashboard', { cookie: manager.loginCookie });
        const shortcut = await request('/admin/staff', { cookie: manager.loginCookie });
        const directory = await request('/admin/employees', { cookie: manager.loginCookie });
        const managerRecord = await User.findOne({ where: { username: manager.username } });
        const employeePage = await request(`/admin/employees/${managerRecord.id}`, { cookie: manager.loginCookie });
        const createdPage = await request('/admin/staff/created', { cookie: manager.loginCookie });
        const post = await request('/admin/staff', {
            method: 'POST',
            cookie: manager.loginCookie,
            body: form({ fullName: blockedName, role: 'WASHING' })
        });
        const after = await User.count({ where: { fullName: blockedName } });

        record('Manager cannot open the admin dashboard', page.status === 403);
        record('Manager cannot open staff creation routes', shortcut.status === 403 && directory.status === 403 && employeePage.status === 403 && createdPage.status === 403);
        record('Manager cannot create a staff account from the admin console', post.status === 403 && after === before);

        const otherManager = made.find((account) => account.key === 'manager-2');
        const managerHome = await request('/manager/dashboard', { cookie: manager.loginCookie });
        const managerEmployees = await request('/manager/employees?type=MANAGER', { cookie: manager.loginCookie });
        const managerSelf = await request(`/manager/employees/${managerRecord.id}`, { cookie: manager.loginCookie });
        const managerCreate = await request('/manager/staff', { cookie: manager.loginCookie });
        const seededAdmin = await User.findOne({ where: { username: process.env.ADMIN_USERNAME } });
        const hiddenAdmin = seededAdmin
            ? await request(`/manager/employees/${seededAdmin.id}`, { cookie: manager.loginCookie })
            : null;
        const blockedAdminName = `Blocked Admin ${marker}`;
        const beforeAdmin = await User.count({ where: { fullName: blockedAdminName } });
        const createAdminAttempt = await request('/manager/staff', {
            method: 'POST',
            cookie: manager.loginCookie,
            body: form({ fullName: blockedAdminName, role: 'ADMIN' })
        });

        record(
            'Manager opens the same dashboard',
            managerHome.status === 200 &&
                managerHome.text.includes('Manager console') &&
                managerHome.text.includes('href="/manager/employees"') &&
                managerHome.text.includes('href="/manager/customers"') &&
                managerHome.text.includes('You are logged in as Manager') &&
                managerHome.text.includes('Open bookings')
        );
        record(
            'Manager employee list hides admins and the signed-in manager',
            managerEmployees.status === 200 &&
                !managerEmployees.text.includes('type=ADMIN') &&
                !managerEmployees.text.includes(`<small>${manager.username}</small>`) &&
                (!otherManager || managerEmployees.text.includes(`<small>${otherManager.username}</small>`)) &&
                managerSelf.status === 302 &&
                managerSelf.location.includes('/manager/employees') &&
                hiddenAdmin &&
                hiddenAdmin.status === 404 &&
                managerCreate.status === 200 &&
                !managerCreate.text.includes('value="ADMIN"') &&
                managerCreate.text.includes('value="MANAGER"') &&
                createAdminAttempt.status === 303 &&
                createAdminAttempt.location.includes('/manager/staff') &&
                !createAdminAttempt.location.includes('/created') &&
                await User.count({ where: { fullName: blockedAdminName } }) === beforeAdmin
        );
    } else {
        record('Manager cannot create a staff account from the admin console', false, 'manager login was not available');
    }

    const customerPassword = `CustomerPass${marker.slice(-4)}`;
    const customer = await User.create({
        fullName: `Customer ${marker}`,
        email: `customer.${marker}@example.com`,
        username: null,
        passwordHash: await bcrypt.hash(customerPassword, 10),
        role: 'CUSTOMER',
        isActive: true
    });
    createdIds.push(customer.id);

    const customerLogin = await request('/customer/login', {
        method: 'POST',
        body: form({
            email: customer.email,
            password: customerPassword
        })
    });
    record(
        'Customer login still works',
        customerLogin.status === 302 && customerLogin.location.includes('/customer/dashboard')
    );

    const customerTarget = `Blocked Customer ${marker}`;
    const beforeCustomer = await User.count({ where: { fullName: customerTarget } });
    const customerPost = await request('/admin/staff', {
        method: 'POST',
        cookie: customerLogin.cookie,
        body: form({ fullName: customerTarget, role: 'ADMIN' })
    });
    const customerDash = await request('/admin/dashboard', { cookie: customerLogin.cookie });
    record(
        'Customer cannot create a staff account',
        customerPost.status === 302 &&
            customerPost.location.includes('/customer/dashboard') &&
            customerDash.status === 302 &&
            customerDash.location.includes('/customer/dashboard') &&
            await User.count({ where: { fullName: customerTarget } }) === beforeCustomer
    );

    const customerList = await request('/admin/customers', { cookie: adminCookie });
    adminCookie = customerList.cookie || adminCookie;
    const customerDetail = await request(`/admin/customers/${customer.id}`, { cookie: adminCookie });
    adminCookie = customerDetail.cookie || adminCookie;
    record(
        'Admin can open the customer list and account',
        customerList.status === 200 &&
            customerList.text.includes('Manage customers') &&
            customerList.text.includes(customer.fullName) &&
            customerList.text.includes(customer.email) &&
            customerList.text.includes('id="customer-search"') &&
            customerList.text.includes('data-status-filter="active"') &&
            customerList.text.includes('data-status-filter="banned"') &&
            customerDetail.status === 200 &&
            customerDetail.text.includes(customer.email) &&
            customerDetail.text.includes('id="status-popup"')
    );
    if (manager && manager.loginCookie) {
        const deniedCustomers = await request('/admin/customers', { cookie: manager.loginCookie });
        const managerCustomers = await request('/manager/customers', { cookie: manager.loginCookie });
        record('Manager cannot open customers', deniedCustomers.status === 403);
        record(
            'Manager can open customers from the manager console',
            managerCustomers.status === 200 &&
                managerCustomers.text.includes('Manage customers') &&
                managerCustomers.text.includes(customer.fullName)
        );
    }

    const ban = await request(`/admin/customers/${customer.id}/status`, {
        method: 'POST',
        cookie: adminCookie,
        body: form({ active: 'false' })
    });
    adminCookie = ban.cookie || adminCookie;
    const bannedUser = await User.findByPk(customer.id);
    const bannedLogin = await request('/customer/login', {
        method: 'POST',
        body: form({ email: customer.email, password: customerPassword })
    });
    const kicked = await request('/customer/dashboard', { cookie: customerLogin.cookie });
    record(
        'Banned customer cannot log in',
        ban.status === 303 &&
            bannedUser.isActive === false &&
            bannedLogin.status === 200 &&
            bannedLogin.text.includes('You are banned for violating our policy.') &&
            bannedLogin.text.includes('+961 81690063') &&
            kicked.status === 302 &&
            kicked.location.includes('/customer/login?banned=1')
    );

    const unban = await request(`/admin/customers/${customer.id}/status`, {
        method: 'POST',
        cookie: adminCookie,
        body: form({ active: 'true' })
    });
    adminCookie = unban.cookie || adminCookie;
    const restoredCustomer = await User.findByPk(customer.id);
    const restoredLogin = await request('/customer/login', {
        method: 'POST',
        body: form({ email: customer.email, password: customerPassword })
    });
    record(
        'Unbanned customer can log in again',
        unban.status === 303 && restoredCustomer.isActive === true && restoredLogin.status === 302
    );

    const invalidCases = [
        { name: 'empty name', body: { fullName: '', role: 'MANAGER' }, message: 'Please enter the employee full name.' },
        { name: 'symbols only', body: { fullName: '!!!', role: 'MANAGER' }, message: 'Full name can only include letters' },
        { name: 'name too long', body: { fullName: 'A'.repeat(101), role: 'MANAGER' }, message: 'Full name must be between 2 and 100 characters.' },
        { name: 'customer role', body: { fullName: `Nora ${marker}`, role: 'CUSTOMER' }, message: 'Select a staff role.' },
        { name: 'unknown role', body: { fullName: `Nora ${marker}`, role: 'OWNER' }, message: 'Select a staff role.' },
        { name: 'lowercase role', body: { fullName: `Nora ${marker}`, role: 'admin' }, message: 'Select a staff role.' }
    ];

    for (const invalid of invalidCases) {
        const before = await User.count();
        const post = await request('/admin/staff', {
            method: 'POST',
            cookie: adminCookie,
            body: form(invalid.body)
        });
        adminCookie = post.cookie;
        const page = post.status === 303
            ? await request('/admin/staff', { cookie: adminCookie })
            : post;
        if (page.cookie) {
            adminCookie = page.cookie;
        }

        record(
            `Invalid ${invalid.name} is rejected`,
            post.status === 303 &&
                post.location.includes('/admin/staff') &&
                page.text.includes(invalid.message) &&
                await User.count() === before
        );
    }

    const adminAgain = await request('/login', {
        method: 'POST',
        body: form({
            username: process.env.ADMIN_USERNAME,
            password: process.env.ADMIN_PASSWORD
        })
    });
    record(
        'Seeded admin login still works after staff creation',
        adminAgain.status === 302 && adminAgain.location.includes('/admin/dashboard')
    );

    const washing = made.find((account) => account.key === 'washing');
    if (washing && manager && manager.loginCookie) {
        const washingUser = await User.findOne({ where: { username: washing.username } });
        if (washingUser) {
            const denied = await request(`/admin/employees/${washingUser.id}/delete`, {
                method: 'POST',
                cookie: manager.loginCookie
            });
            record('Manager cannot delete a staff account', denied.status === 403 && await User.findByPk(washingUser.id));

            const missing = await request('/admin/employees/99999999/delete', {
                method: 'POST',
                cookie: adminAgain.cookie
            });
            const missingPage = missing.status === 303
                ? await request(missing.location, { cookie: missing.cookie || adminAgain.cookie })
                : missing;
            record(
                'Deleting a missing account shows a failure popup',
                missing.status === 303 && missingPage.text.includes('Could not delete account')
            );

            const deleted = await request(`/admin/employees/${washingUser.id}/delete`, {
                method: 'POST',
                cookie: missingPage.cookie || adminAgain.cookie
            });
            const deletedPage = deleted.status === 303
                ? await request(deleted.location, { cookie: deleted.cookie || adminAgain.cookie })
                : deleted;
            record(
                'Admin can delete a staff account',
                deleted.status === 303 &&
                    deleted.location.includes('/admin/employees?type=WASHING') &&
                    !await User.findByPk(washingUser.id) &&
                    deletedPage.text.includes('Account deleted') &&
                    deletedPage.text.includes(washing.fullName)
            );
        } else {
            record('Admin can delete a staff account', false, 'washing account was not available');
        }
    } else {
        record('Admin can delete a staff account', false, 'washing account was not available');
    }

    const profilePassword = `ProfilePass${marker.slice(-4)}`;
    const profileAdmin = await User.create({
        fullName: `Profile ${marker}`,
        username: `admin.profile${marker.slice(-6)}`,
        passwordHash: await bcrypt.hash('OldProfile1', 10),
        role: 'ADMIN',
        isActive: true
    });
    createdIds.push(profileAdmin.id);

    const profileLogin = await request('/login', {
        method: 'POST',
        body: form({ username: profileAdmin.username, password: 'OldProfile1' })
    });
    const profileHome = await request('/admin/dashboard', { cookie: profileLogin.cookie });
    record(
        'Admin can open the profile menu',
        profileLogin.status === 302 &&
            profileHome.status === 200 &&
            profileHome.text.includes('class="profile-menu"') &&
            profileHome.text.includes('class="sidebar-user profile-trigger"') &&
            profileHome.text.includes('href="/admin/profile"') &&
            profileHome.text.includes('>Profile<')
    );

    const profilePage = await request('/admin/profile', { cookie: profileHome.cookie || profileLogin.cookie });
    record(
        'Admin can view their username and profile information',
        profilePage.status === 200 &&
            profilePage.text.includes(profileAdmin.fullName) &&
            profilePage.text.includes(profileAdmin.username) &&
            profilePage.text.includes('value="Admin"') &&
            profilePage.text.includes('name="currentPassword"') &&
            !profilePage.text.includes('passwordHash')
    );

    const wrongPassword = await request('/admin/profile/password', {
        method: 'POST',
        cookie: profilePage.cookie || profileLogin.cookie,
        body: form({
            currentPassword: 'wrong-password',
            password: profilePassword,
            confirmPassword: profilePassword
        })
    });
    const wrongPage = wrongPassword.status === 303
        ? await request(wrongPassword.location, { cookie: wrongPassword.cookie })
        : wrongPassword;
    const unchanged = await User.findByPk(profileAdmin.id);
    record(
        'Incorrect current password is rejected',
        wrongPassword.status === 303 &&
            wrongPage.text.includes('Current password is incorrect.') &&
            await bcrypt.compare('OldProfile1', unchanged.passwordHash)
    );

    const changedPassword = await request('/admin/profile/password', {
        method: 'POST',
        cookie: wrongPage.cookie || profileLogin.cookie,
        body: form({
            currentPassword: 'OldProfile1',
            password: profilePassword,
            confirmPassword: profilePassword
        })
    });
    const changedPage = changedPassword.status === 303
        ? await request(changedPassword.location, { cookie: changedPassword.cookie })
        : changedPassword;
    const updatedProfile = await User.findByPk(profileAdmin.id);
    const newLogin = await request('/login', {
        method: 'POST',
        body: form({ username: profileAdmin.username, password: profilePassword })
    });
    record(
        'Admin can change their own password',
        changedPassword.status === 303 &&
            changedPage.text.includes('Password updated') &&
            updatedProfile.username === profileAdmin.username &&
            updatedProfile.role === 'ADMIN' &&
            await bcrypt.compare(profilePassword, updatedProfile.passwordHash) &&
            newLogin.status === 302 &&
            newLogin.location.includes('/admin/dashboard')
    );

    if (manager && manager.loginCookie) {
        const managerProfile = await request('/admin/profile', { cookie: manager.loginCookie });
        const managerPassword = await request('/admin/profile/password', {
            method: 'POST',
            cookie: manager.loginCookie,
            body: form({
                currentPassword: 'OldProfile1',
                password: profilePassword,
                confirmPassword: profilePassword
            })
        });
        const managerHome = await request('/manager/dashboard', { cookie: manager.loginCookie });
        record(
            'Manager cannot see or access the admin profile',
            managerProfile.status === 403 &&
                managerPassword.status === 403 &&
                managerHome.status === 200 &&
                !managerHome.text.includes('profile-menu') &&
                !managerHome.text.includes('/admin/profile') &&
                managerHome.text.includes('Logout')
        );
    } else {
        record('Manager cannot see or access the admin profile', false, 'manager login was not available');
    }

    const logout = await request('/logout', {
        method: 'POST',
        cookie: adminAgain.cookie
    });
    record('Staff logout still works', logout.status === 302 && logout.location.includes('/login'));
};

const finish = async (error) => {
    if (error) {
        console.error(error);
        record('Verification run completed', false, error.message);
    }

    try {
        await cleanup();
        const remaining = await User.count({
            where: {
                [Op.or]: [
                    { fullName: { [Op.like]: `% ${marker}` } },
                    { email: `customer.${marker}@example.com` }
                ]
            }
        });
        record('Temporary test accounts were removed', remaining === 0);
    } catch (cleanupError) {
        console.error(cleanupError);
        record('Temporary test accounts were removed', false, cleanupError.message);
    }

    const failed = results.filter((result) => !result.ok);
    console.log(`\n${results.length - failed.length}/${results.length} passed`);

    try {
        await sequelize.close();
    } catch (closeError) {
        console.error(closeError);
    }

    process.exit(failed.length || error ? 1 : 0);
};

run().then(() => finish()).catch((error) => finish(error));
