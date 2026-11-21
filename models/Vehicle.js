const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');

const Vehicle = sequelize.define('Vehicle', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },

    customerId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
    },

    make: {
        type: DataTypes.STRING(50),
        allowNull: false
    },

    model: {
        type: DataTypes.STRING(50),
        allowNull: false
    },

    year: {
        type: DataTypes.INTEGER,
        allowNull: false
    },

    licensePlate: {
        type: DataTypes.STRING(30),
        allowNull: false
    },

    color: {
        type: DataTypes.STRING(30),
        allowNull: false
    },

    image: {
        type: DataTypes.STRING(255),
        allowNull: false
    }
}, {
    tableName: 'vehicles',
    timestamps: true,
    underscored: true,
    indexes: [
        { fields: ['customer_id'] }
    ]
});

User.hasMany(Vehicle, {
    foreignKey: 'customerId',
    onDelete: 'CASCADE'
});

Vehicle.belongsTo(User, {
    foreignKey: 'customerId'
});

module.exports = Vehicle;
