const crypto = require('crypto');

const generateOTP = () => {
    // Generate a random 6-digit number
    // Using crypto.randomInt for better randomness than Math.random
    const otp = crypto.randomInt(100000, 999999).toString();
    return otp;
};

module.exports = { generateOTP };
