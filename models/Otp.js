const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Otp = sequelize.define('Otp', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },

    email: {
        type: DataTypes.STRING(150),
        allowNull: false
    },

    otpHash: {
        type: DataTypes.STRING(255),
        allowNull: false
    },

    purpose: {
        type: DataTypes.ENUM('SIGNUP', 'PASSWORD_RESET'),
        allowNull: false
    },

    expiresAt: {
        type: DataTypes.DATE,
        allowNull: false
    },

    isUsed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    }
}, {
    tableName: 'otps',
    timestamps: true,
    updatedAt: false,
    underscored: true,
    indexes: [
        { fields: ['email'] },
        { fields: ['purpose'] },
        { fields: ['expires_at'] },
        { fields: ['email', 'purpose', 'is_used'] }
    ]
});

module.exports = Otp;
