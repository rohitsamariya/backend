const mongoose = require('mongoose');

const connectDB = async () => {
    const MONGO_URI = process.env.MONGO_URI;

    if (!MONGO_URI) {
        console.error('❌ MONGO_URI is missing in environment variables.');
        process.exit(1);
    }

    const connOptions = {
        // Essential for Atlas Replica Sets
        serverSelectionTimeoutMS: 30000,
        heartbeatFrequencyMS: 10000,
        socketTimeoutMS: 45000,
        family: 4, // Force IPv4 to avoid DNS delays
        autoIndex: process.env.NODE_ENV !== 'production'
    };

    const maxRetries = 5;
    let retries = 0;

    while (retries < maxRetries) {
        try {
            console.log(`[DB] Connecting to MongoDB (Attempt ${retries + 1}/${maxRetries})...`);

            // If the URI is a shard URI with directConnection=true, warn about it
            if (MONGO_URI.includes('directConnection=true')) {
                console.warn('⚠️ WARNING: MONGO_URI contains directConnection=true. This will prevent writes if the node is not Primary.');
            }

            const conn = await mongoose.connect(MONGO_URI, connOptions);
            console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

            // Check if we are connected to a Primary
            const admin = conn.connection.db.admin();
            const status = await admin.serverStatus();
            if (status.repl && !status.repl.ismaster && !status.repl.isWritablePrimary) {
                console.warn('⚠️ WARNING: Connected to a SECONDARY node. Writes may fail.');
            }

            return;
        } catch (error) {
            retries++;
            console.error(`❌ MongoDB Connection Error (Attempt ${retries}):`, error.message);

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
