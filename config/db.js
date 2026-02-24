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
            // Attempt 1: Using the provided MONGO_URI
            console.log(`Connecting to MongoDB... (Attempt ${retries + 1}/${maxRetries})`);
            const conn = await mongoose.connect(process.env.MONGO_URI, connOptions);
            console.log(`✅ MongoDB connected successfully: ${conn.connection.host}`);
            return;
        } catch (error) {
            retries++;
            console.error(`❌ MongoDB connection failed:`, error.message);

            // Fallback: If SRV is blocked, try direct connection to shards
            if (error.message.includes('ECONNREFUSED') || error.message.includes('querySrv') || error.message.includes('timeout')) {
                console.log('⚠️ SRV/DNS issue detected. Attempting direct shard fallback...');
                try {
                    // This fallback URI is specific to your Atlas Cluster and bypasses the DNS SRV issues
                    const fallbackUri = 'mongodb://hrmsuser:j6jTgFYcflQgEq32@ac-gdvbveo-shard-00-00.akr9n7d.mongodb.net:27017,ac-gdvbveo-shard-00-01.akr9n7d.mongodb.net:27017,ac-gdvbveo-shard-00-02.akr9n7d.mongodb.net:27017/hrms_attendance?ssl=true&authSource=admin&replicaSet=atlas-gdvbveo-shard-0&retryWrites=true&w=majority';
                    const conn = await mongoose.connect(fallbackUri, connOptions);
                    console.log(`✅ MongoDB connected via Fallback (Direct Shard)`);
                    return;
                } catch (fallbackErr) {
                    console.error(`❌ Fallback connection also failed:`, fallbackErr.message);
                }
            }

            if (retries >= maxRetries) {
                console.error('FATAL: Max retries reached. Could not connect to any database endpoint.');
                process.exit(1);
            }
            console.log('Retrying in 5s...');
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
};

module.exports = connectDB;
