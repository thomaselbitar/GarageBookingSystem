
require('dotenv').config();

const bcrypt = require('bcrypt');
const sequelize = require('../config/database');
const User = require('../models/User');

const createAdmin = async () => {
    try {
        await sequelize.authenticate();
        await sequelize.sync();

        const hashedPassword = await bcrypt.hash(
            process.env.ADMIN_PASSWORD,
            10
        );

        const [admin, created] = await User.findOrCreate({
            where: {
                username: process.env.ADMIN_USERNAME
            },
            defaults: {
                fullName: process.env.ADMIN_NAME,
                username: process.env.ADMIN_USERNAME,
                passwordHash: hashedPassword,
                role: 'ADMIN'
            }
        });

        if (created) {
            console.log('Admin account created successfully!');
        } else {
            await admin.update({
                fullName: process.env.ADMIN_NAME,
                passwordHash: hashedPassword,
                role: 'ADMIN',
                isActive: true
            });

            console.log('Admin account updated successfully!');
        }

    } catch (error) {
        console.error('Error creating Admin:', error);
    } finally {
        await sequelize.close();
    }
};

createAdmin();
