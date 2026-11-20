const bcrypt = require('bcrypt');
const User = require('../models/User');
const { firstValidationError } = require('../validators/staffAccountValidators');
const {
    STAFF_ROLES,
    STAFF_ROLE_VALUES,
    roleByValue,
    nextUsername,
    generateTemporaryPassword,
    isUsernameConflict
} = require('../services/staffAccountService');

const BCRYPT_ROUNDS = 10;

const consoleBase = (req) => (req.console && req.console.base) || '/admin';

const consoleStaffRoles = (req) => (
    req.console && req.console.staffRoles ? req.console.staffRoles : STAFF_ROLES
);

const consoleManageableRoles = (req) => (
    req.console && req.console.manageableRoles ? req.console.manageableRoles : STAFF_ROLE_VALUES
);

const formValuesFrom = (body = {}) => ({
    fullName: typeof body.fullName === 'string'
        ? body.fullName.trim().replace(/\s+/g, ' ')
        : '',
    role: typeof body.role === 'string' ? body.role.trim() : ''
});

const saveFormError = (req, res, formError, formValues) => {
    req.session.staffFormError = { formError, formValues };

    req.session.save((err) => {
        if (err) {
            console.error('Could not save staff form message:', err);
            return res.status(500).send('Could not save the form message.');
        }

        return res.redirect(303, `${consoleBase(req)}/staff`);
    });
};

const renderCreateStaff = (req, res) => {
    const flash = req.session.staffFormError || null;
    delete req.session.staffFormError;

    const send = () => {
        res.render('admin/create-staff', {
            user: req.session.user,
            staffRoles: consoleStaffRoles(req),
            formError: flash ? flash.formError : null,
            formValues: flash ? flash.formValues : { fullName: '', role: '' }
        });
    };

    if (!flash) {
        return send();
    }

    return req.session.save((err) => {
        if (err) {
            console.error('Could not clear staff form message:', err);
        }

        return send();
    });
};

const preventCaching = (res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
};

exports.getDashboard = (req, res) => {
    res.render('dashboards/admin', {
        user: req.session.user
    });
};

exports.getCreateStaff = (req, res) => {
    renderCreateStaff(req, res);
};

const loadManagedEmployee = async (req) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
        return null;
    }

    const employee = await User.findOne({
        attributes: ['id', 'fullName', 'username', 'role', 'isActive', 'passwordHash'],
        where: {
            id,
            role: consoleManageableRoles(req)
        }
    });

    if (!employee) {
        return null;
    }

    if (req.session.user && employee.id === req.session.user.id) {
        return 'self';
    }

    return employee;
};

const employeeProfile = (employee) => ({
    id: employee.id,
    fullName: employee.fullName,
    username: employee.username,
    role: employee.role,
    isActive: employee.isActive
});

const renderEmployee = (req, res, employee) => {
    const noticeId = req.session.employeePasswordNotice;
    const errorFlash = req.session.employeePasswordError;
    const deleteFlash = req.session.employeeDeleteError;
    delete req.session.employeePasswordNotice;
    delete req.session.employeePasswordError;

    if (deleteFlash && deleteFlash.id === employee.id) {
        delete req.session.employeeDeleteError;
    }

    const send = () => {
        const role = roleByValue(employee.role);
        res.render('admin/employee', {
            user: req.session.user,
            employee: employeeProfile(employee),
            roleLabel: role ? role.label : employee.role,
            formError: errorFlash && errorFlash.id === employee.id ? errorFlash.message : null,
            passwordUpdated: noticeId === employee.id,
            deleteError: deleteFlash && deleteFlash.id === employee.id ? deleteFlash.message : null
        });
    };

    if (!noticeId && !errorFlash && !(deleteFlash && deleteFlash.id === employee.id)) {
        return send();
    }

    return req.session.save((err) => {
        if (err) {
            console.error('Could not clear employee password message:', err);
        }

        return send();
    });
};

exports.getEmployee = async (req, res) => {
    try {
        const employee = await loadManagedEmployee(req);

        if (employee === 'self') {
            return res.redirect(`${consoleBase(req)}/employees`);
        }

        if (!employee) {
            return res.status(404).send('Employee not found.');
        }

        return renderEmployee(req, res, employee);
    } catch (error) {
        console.error('Could not open employee:', error);
        return res.status(500).send('Could not open the employee.');
    }
};

exports.updateEmployeeStatus = async (req, res) => {
    try {
        const employee = await loadManagedEmployee(req);

        if (employee === 'self') {
            return res.redirect(`${consoleBase(req)}/employees`);
        }

        if (!employee) {
            return res.status(404).send('Employee not found.');
        }

        if (req.body.active !== 'true' && req.body.active !== 'false') {
            return res.status(400).send('Invalid account status.');
        }

        await employee.update({
            isActive: req.body.active === 'true'
        });

        return res.redirect(303, `${consoleBase(req)}/employees/${employee.id}`);
    } catch (error) {
        console.error('Could not update employee status:', error);
        return res.status(500).send('Could not update the account status.');
    }
};

const saveDeleteResult = (req, res, redirectTo) => {
    return req.session.save((err) => {
        if (err) {
            console.error('Could not save the delete result:', err);
            return res.status(500).send('Could not show the delete result.');
        }

        return res.redirect(303, redirectTo);
    });
};

exports.deleteEmployee = async (req, res) => {
    try {
        const employee = await loadManagedEmployee(req);

        if (employee === 'self') {
            return res.redirect(`${consoleBase(req)}/employees`);
        }

        if (!employee) {
            req.session.employeeDeleteError = {
                message: 'This account could not be deleted.'
            };
            return saveDeleteResult(req, res, `${consoleBase(req)}/employees`);
        }

        const role = employee.role;
        const fullName = employee.fullName;
        await employee.destroy();
        delete req.session.employeeDeleteError;
        req.session.employeeDeleteNotice = { role, fullName };
        return saveDeleteResult(req, res, `${consoleBase(req)}/employees?type=${role}`);
    } catch (error) {
        console.error('Could not delete employee:', error);
        const id = Number(req.params.id);
        req.session.employeeDeleteError = {
            id: Number.isInteger(id) ? id : null,
            message: 'This account could not be deleted.'
        };
        const redirectTo = Number.isInteger(id)
            ? `${consoleBase(req)}/employees/${id}`
            : `${consoleBase(req)}/employees`;
        return saveDeleteResult(req, res, redirectTo);
    }
};

exports.updateEmployeePassword = async (req, res) => {
    try {
        const employee = await loadManagedEmployee(req);

        if (employee === 'self') {
            return res.redirect(`${consoleBase(req)}/employees`);
        }

        if (!employee) {
            return res.status(404).send('Employee not found.');
        }

        const validationError = firstValidationError(req);
        if (validationError) {
            req.session.employeePasswordError = {
                id: employee.id,
                message: validationError
            };

            return req.session.save((err) => {
                if (err) {
                    console.error('Could not save password message:', err);
                    return res.status(500).send('Could not save the form message.');
                }

                return res.redirect(303, `${consoleBase(req)}/employees/${employee.id}`);
            });
        }

        await employee.update({
            passwordHash: await bcrypt.hash(req.body.password, BCRYPT_ROUNDS)
        });

        delete req.session.employeePasswordError;
        req.session.employeePasswordNotice = employee.id;

        return req.session.save((err) => {
            if (err) {
                console.error('Could not save password update message:', err);
                return res.status(500).send('The password was updated, but the confirmation could not be shown.');
            }

            return res.redirect(303, `${consoleBase(req)}/employees/${employee.id}`);
        });
    } catch (error) {
        console.error('Could not update employee password:', error);
        return res.status(500).send('Could not update the password.');
    }
};

exports.getEmployees = async (req, res) => {
    const roles = consoleStaffRoles(req);
    const requested = typeof req.query.type === 'string' ? req.query.type.trim().toUpperCase() : '';
    const selectedRole = roles.find((role) => role.value === requested) || roles[0];

    try {
        const staff = await User.findAll({
            attributes: ['id', 'fullName', 'username', 'role', 'isActive'],
            where: { role: consoleManageableRoles(req) },
            order: [['fullName', 'ASC'], ['username', 'ASC']]
        });
        const currentUserId = req.session.user && req.session.user.id;
        const visibleStaff = staff.filter((employee) => employee.id !== currentUserId);

        const counts = {};
        roles.forEach((role) => {
            counts[role.value] = 0;
        });
        visibleStaff.forEach((employee) => {
            if (counts[employee.role] !== undefined) {
                counts[employee.role] += 1;
            }
        });

        const deleteNotice = req.session.employeeDeleteNotice || null;
        const listDeleteError = req.session.employeeDeleteError && !req.session.employeeDeleteError.id
            ? req.session.employeeDeleteError.message
            : null;
        delete req.session.employeeDeleteNotice;

        if (!req.session.employeeDeleteError || !req.session.employeeDeleteError.id) {
            delete req.session.employeeDeleteError;
        }

        const send = () => res.render('admin/employees', {
            user: req.session.user,
            staffRoles: roles,
            selectedRole,
            counts,
            employees: visibleStaff.filter((employee) => employee.role === selectedRole.value),
            deleteNotice,
            deleteError: listDeleteError
        });

        if (!deleteNotice && !listDeleteError) {
            return send();
        }

        return req.session.save((err) => {
            if (err) {
                console.error('Could not clear the delete result:', err);
            }

            return send();
        });
    } catch (error) {
        console.error('Could not load employees:', error);
        return res.status(500).send('Could not load employees.');
    }
};

exports.createStaffAccount = async (req, res) => {
    const formValues = formValuesFrom(req.body);
    const validationError = firstValidationError(req);

    if (validationError) {
        return saveFormError(req, res, validationError, formValues);
    }

    try {
        const temporaryPassword = generateTemporaryPassword();
        const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);
        let user = null;

        for (let attempt = 0; attempt < 5; attempt += 1) {
            const username = await nextUsername(formValues.role, formValues.fullName);

            if (!username) {
                return saveFormError(
                    req,
                    res,
                    'Enter a full name that starts with a first name.',
                    formValues
                );
            }

            try {
                user = await User.create({
                    fullName: formValues.fullName,
                    username,
                    passwordHash,
                    role: formValues.role,
                    isActive: true
                });
                break;
            } catch (error) {
                if (isUsernameConflict(error) && attempt < 4) {
                    continue;
                }

                throw error;
            }
        }

        if (!user) {
            throw new Error('Username could not be reserved.');
        }

        const staffRole = roleByValue(user.role);
        delete req.session.staffFormError;
        req.session.createdStaffAccount = {
            fullName: user.fullName,
            username: user.username,
            role: user.role,
            roleLabel: staffRole ? staffRole.label : user.role,
            temporaryPassword
        };

        return req.session.save((err) => {
            if (err) {
                console.error('Could not store new staff credentials in session:', err);
                preventCaching(res);
                return res.render('admin/staff-created', {
                    user: req.session.user,
                    account: req.session.createdStaffAccount
                });
            }

            return res.redirect(303, `${consoleBase(req)}/staff/created`);
        });
    } catch (error) {
        console.error('Staff account creation failed:', error);
        return saveFormError(
            req,
            res,
            'Could not create the staff account. Please try again.',
            formValues
        );
    }
};

exports.getCreatedStaffAccount = (req, res) => {
    const account = req.session.createdStaffAccount || null;

    if (account) {
        req.session.createdStaffRole = account.role;
    }

    const backRole = account ? account.role : req.session.createdStaffRole || '';
    delete req.session.createdStaffAccount;

    const send = () => {
        preventCaching(res);
        return res.render('admin/staff-created', {
            user: req.session.user,
            account,
            backRole
        });
    };

    return req.session.save((err) => {
        if (err) {
            console.error('Could not clear staff credentials from session:', err);

            if (!account) {
                return res.status(500).send('Could not open the credentials page.');
            }

            return res.status(500).send('Could not prepare the credentials page. Refresh to view them once.');
        }

        return send();
    });
};
