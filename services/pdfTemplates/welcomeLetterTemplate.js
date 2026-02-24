const getWelcomeLetterHTML = (employeeName, branchName, role, date) => {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Helvetica', sans-serif; line-height: 1.6; color: #333; }
            .header { text-align: center; margin-bottom: 40px; background-color: #f8f9fa; padding: 20px; }
            .title { font-size: 28px; font-weight: bold; margin-bottom: 20px; color: #2c3e50; text-align: center; }
            .content { margin-bottom: 40px; padding: 0 20px; }
            .info-box { background: #eef2f3; padding: 20px; border-radius: 5px; margin: 20px 0; }
            .footer { margin-top: 50px; font-size: 12px; text-align: center; color: #777; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>COMPANY NAME</h1>
        </div>

        <div class="title">WELCOME ABOARD!</div>

        <div class="content">
            <p>Dear <strong>${employeeName}</strong>,</p>

            <p>Welcome to the team! We are thrilled to have you join us as a <strong>${role}</strong> at <strong>${branchName}</strong>.</p>

            <div class="info-box">
                <h3>Your Details</h3>
                <p><strong>Employee:</strong> ${employeeName}</p>
                <p><strong>Role:</strong> ${role}</p>
                <p><strong>Branch:</strong> ${branchName}</p>
                <p><strong>Activation Date:</strong> ${date}</p>
            </div>

            <p>Your account is now fully active. You can log in to the employee dashboard to view your schedule, clock in/out, and manage your profile.</p>

            <p>We look forward to working with you!</p>
        </div>

        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Company Name. All rights reserved.</p>
        </div>
    </body>
    </html>
    `;
};

module.exports = { getWelcomeLetterHTML };
