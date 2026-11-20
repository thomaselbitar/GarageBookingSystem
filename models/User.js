
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },

    fullName: {
        type: DataTypes.STRING(100),
        allowNull: false
    },

    email: {
        type: DataTypes.STRING(150),
        allowNull: true,
        unique: true
    },

    username: {
        type: DataTypes.STRING(100),
        allowNull: true,
        unique: true
    },

    passwordHash: {
        type: DataTypes.STRING(255),
        allowNull: true
    },

    role: {
        type: DataTypes.ENUM(
            'ADMIN',
            'MANAGER',
            'WASHING',
            'DETAILING',
            'PAINTING',
            'MECHANIC',
            'CUSTOMER'
        ),
        allowNull: false
    },

    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
}, {
    tableName: 'users',
    timestamps: true,
    underscored: true
});

module.exports = User;
