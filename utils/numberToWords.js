/**
 * Number to Words — Indian Numbering System
 * 
 * Converts a number to words using Indian lakhs/crores format.
 * Example: 142480 → "One Lakh Forty Two Thousand Four Hundred Eighty Rupees Only"
 */

const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigitWords(n) {
    if (n < 20) return ones[n];
    return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
}

function threeDigitWords(n) {
    if (n === 0) return '';
    if (n < 100) return twoDigitWords(n);
    const h = Math.floor(n / 100);
    const rem = n % 100;
    return ones[h] + ' Hundred' + (rem ? ' ' + twoDigitWords(rem) : '');
}

/**
 * Convert number to Indian words
 * Uses: Crore, Lakh, Thousand, Hundred
 * 
 * @param {number} amount - The amount (supports up to ₹99,99,99,999)
 * @returns {string} Amount in words with "Rupees" suffix
 */
function numberToWords(amount) {
    if (amount === 0) return 'Zero Rupees Only';
    if (amount < 0) return 'Minus ' + numberToWords(Math.abs(amount));

    const rupees = Math.floor(amount);
    const paise = Math.round((amount - rupees) * 100);

    let words = '';

    // Crores (1,00,00,000+)
    const crores = Math.floor(rupees / 10000000);
    if (crores > 0) words += twoDigitWords(crores) + ' Crore ';

    // Lakhs (1,00,000+)
    const lakhs = Math.floor((rupees % 10000000) / 100000);
    if (lakhs > 0) words += twoDigitWords(lakhs) + ' Lakh ';

    // Thousands (1,000+)
    const thousands = Math.floor((rupees % 100000) / 1000);
    if (thousands > 0) words += twoDigitWords(thousands) + ' Thousand ';

    // Hundreds and below
    const remainder = rupees % 1000;
    if (remainder > 0) words += threeDigitWords(remainder);

    words = words.trim() + ' Rupees';

    if (paise > 0) {
        words += ' and ' + twoDigitWords(paise) + ' Paise';
    }

    return words + ' Only';
}

module.exports = { numberToWords };
