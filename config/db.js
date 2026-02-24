const mongoose = require('mongoose');

const connectDB = async () => {
    const connOptions = {
        // Optimization for production
        autoIndex: process.env.NODE_ENV === 'production' ? false : true,
        serverSelectionTimeoutMS: 5000,
    };

    const maxRetries = 5;
    let retries = 0;

    while (retries < maxRetries) {
        try {
            const conn = await mongoose.connect(process.env.MONGO_URI, connOptions);
            console.log(`MongoDB connected successfully: ${conn.connection.host}`);
            return;
        } catch (error) {
            retries++;
            console.error(`MongoDB connection failed (Attempt ${retries}/${maxRetries}):`, error.message);
            if (retries >= maxRetries) {
                console.error('Max retries reached. Exiting...');
                process.exit(1);
            }
            // Wait for 5 seconds before retrying
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
};

module.exports = connectDB;
