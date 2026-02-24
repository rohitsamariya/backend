const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Generate a professional Welcome & Onboarding Summary PDF
 * @param {Object} user 
 * @param {Object} branch 
 * @param {Object} shift 
 * @returns {Promise<string>} Path to generated PDF
 */
const generateWelcomePDF = async (user, branch, shift) => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50 });
            const fileName = `Welcome_${user._id}_${Date.now()}.pdf`;
            const dir = path.join(__dirname, '../temp');

            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            const filePath = path.join(dir, fileName);
            const stream = fs.createWriteStream(filePath);

            doc.pipe(stream);

            // Header
            doc.fontSize(25).text('HRMS Company', { align: 'center' });
            doc.fontSize(15).text('Official Welcome & Onboarding Summary', { align: 'center' });
            doc.moveDown();
            doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
            doc.moveDown();

            // Employee Info
            doc.fontSize(14).font('Helvetica-Bold').text('Employee Details:');
            doc.fontSize(12).font('Helvetica').text(`Name: ${user.name}`);
            doc.text(`Email: ${user.email}`);
            doc.text(`Role: ${user.role}`);
            doc.text(`Joined On: ${new Date().toLocaleDateString()}`);
            doc.moveDown();

            // workplace
            doc.fontSize(14).font('Helvetica-Bold').text('Workplace Information:');
            doc.fontSize(12).font('Helvetica').text(`Branch: ${branch.name || 'Main Office'}`);
            doc.text(`Address: ${branch.address || 'Company HQ'}`);
            doc.text(`Shift: ${shift.name || 'Standard'} (${shift.startTime || '9:00 AM'} - ${shift.endTime || '6:00 PM'})`);
            doc.moveDown();

            // Next Steps
            doc.fontSize(14).font('Helvetica-Bold').text('Next Steps:');
            doc.fontSize(12).font('Helvetica').text('1. Your account is now ACTIVE.');
            doc.text('2. Please log in to your dashboard to mark attendance.');
            doc.text('3. Complete any additional site-specific training provided by your manager.');
            doc.moveDown(2);

            // Footer
            doc.fontSize(10).text('This is an electronically generated document. No signature is required.', { align: 'center', color: 'gray' });

            doc.end();

            stream.on('finish', () => resolve(filePath));
        } catch (error) {
            reject(error);
        }
    });
};

module.exports = { generateWelcomePDF };
