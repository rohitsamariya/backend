const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({ path: require('path').join(__dirname, '.env') });

const uri = process.env.MONGO_URI;

async function checkUserLogs() {
    try {
        const conn = await mongoose.createConnection(uri).asPromise();
        const usersCol = conn.db.collection('users');

        const user = await usersCol.findOne({ email: 'rohitsamariya90@gmail.com' });
        if (user && user.emailHistory) {
            const resent = user.emailHistory.filter(h => h.emailType === 'RESET_PASSWORD');
            console.log('Recent RESET_PASSWORD email history:');
            console.log(JSON.stringify(resent.slice(-5), null, 2));
        } else {
            console.log('User not found or no email history.');
        }
        await conn.close();
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkUserLogs();
