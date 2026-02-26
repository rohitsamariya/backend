const mongoose = require('mongoose');

const connectDB = async () => {
    const MONGO_URI = process.env.MONGO_URI;

    if (!MONGO_URI) {
        console.error('❌ MONGO_URI is missing in environment variables.');
        process.exit(1);
    }

    const connOptions = {
        serverSelectionTimeoutMS: 10000, // Give more time for replica set discovery
        connectTimeoutMS: 10000,
        socketTimeoutMS: 45000,
    };

    const maxRetries = 5;
    let retries = 0;

    while (retries < maxRetries) {
        try {
            console.log(`Connecting to MongoDB... (Attempt ${retries + 1}/${maxRetries})`);
            const conn = await mongoose.connect(MONGO_URI, connOptions);
            console.log(`✅ MongoDB connected successfully: ${conn.connection.host}`);
            return;
        } catch (error) {
            retries++;
            console.error(`❌ MongoDB connection attempt ${retries} failed:`, error.message);

            if (retries >= maxRetries) {
                console.error('FATAL: Could not connect to MongoDB after 5 attempts.');
                process.exit(1);
            }

            console.log('Retrying in 5s...');
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
};

module.exports = connectDB;
