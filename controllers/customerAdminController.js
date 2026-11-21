const User = require('../models/User');

const consoleBase = (req) => (req.console && req.console.base) || '/admin';

const loadCustomer = async (req) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
        return null;
    }

    return User.findOne({
        attributes: ['id', 'fullName', 'email', 'isActive', 'createdAt'],
        where: {
            id,
            role: 'CUSTOMER'
        }
    });
};

const customerProfile = (customer) => ({
    id: customer.id,
    fullName: customer.fullName,
    email: customer.email,
    isActive: customer.isActive,
    joinedOn: customer.createdAt
        ? customer.createdAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        : ''
});

exports.getCustomers = async (req, res) => {
    try {
        const customers = await User.findAll({
            attributes: ['id', 'fullName', 'email', 'isActive'],
            where: { role: 'CUSTOMER' },
            order: [['fullName', 'ASC'], ['email', 'ASC']]
        });

        return res.render('console/customers', {
            user: req.session.user,
            customers
        });
    } catch (error) {
        console.error('Could not load customers:', error);
        return res.status(500).send('Could not load customers.');
    }
};

exports.getCustomer = async (req, res) => {
    try {
        const customer = await loadCustomer(req);
        if (!customer) {
            return res.status(404).send('Customer not found.');
        }

        return res.render('console/customer', {
            user: req.session.user,
            customer: customerProfile(customer)
        });
    } catch (error) {
        console.error('Could not open customer:', error);
        return res.status(500).send('Could not open the customer.');
    }
};

exports.updateCustomerStatus = async (req, res) => {
    try {
        const customer = await loadCustomer(req);
        if (!customer) {
            return res.status(404).send('Customer not found.');
        }

        if (req.body.active !== 'true' && req.body.active !== 'false') {
            return res.status(400).send('Invalid account status.');
        }

        await customer.update({
            isActive: req.body.active === 'true'
        });

        return res.redirect(303, `${consoleBase(req)}/customers/${customer.id}`);
    } catch (error) {
        console.error('Could not update customer status:', error);
        return res.status(500).send('Could not update the account status.');
    }
};
