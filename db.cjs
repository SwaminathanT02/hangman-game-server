require('dotenv').config();
const mongoose = require("mongoose");

const Connect = async () => {
    if (mongoose.connections[0].readyState) return;

    try {
        await mongoose.connect(process.env.MONGO_URL);
        console.log("Successfully Connected to Mongo Database");
    } catch (err) {
        throw new Error("Error Connecting To Mongoose!");
    }
}

module.exports = Connect;