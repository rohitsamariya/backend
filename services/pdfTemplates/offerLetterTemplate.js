const getOfferLetterHTML = (candidateName, branchName, role, date) => {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Helvetica', sans-serif; line-height: 1.6; color: #333; }
            .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #333; padding-bottom: 20px; }
            .title { font-size: 24px; font-weight: bold; margin-bottom: 20px; text-align: center; }
            .content { margin-bottom: 40px; }
            .footer { margin-top: 50px; font-size: 12px; text-align: center; color: #777; border-top: 1px solid #ddd; padding-top: 20px; }
            .signature-box { margin-top: 60px; display: flex; justify-content: space-between; }
            .party { width: 45%; border-top: 1px solid #000; padding-top: 10px; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>COMPANY NAME</h1>
            <p>123 Business Road, Corporate City, ST 12345</p>
        </div>

        <div class="title">OFFER OF EMPLOYMENT</div>

        <div class="content">
            <p><strong>Date:</strong> ${date}</p>
            <p><strong>To:</strong> ${candidateName}</p>

            <p>Dear ${candidateName},</p>

            <p>We are pleased to offer you the position of <strong>${role}</strong> at <strong>${branchName}</strong>.</p>

            <p>This offer is contingent upon the successful completion of your background check and registration process. We are excited to have you join our team and believe that you will make a significant contribution to the success of our company.</p>

            <p>Depending on your start date, your first paycheck will differ. You will be on a probationary period for the first 3 months.</p>

            <p>Please review the attached terms and login to our portal to complete your registration.</p>
        </div>

        <div class="signature-box">
            <div class="party">
                <p><strong>Authorized Signature</strong></p>
                <p>HR Manager</p>
            </div>
            <div class="party" style="text-align: right;">
                <p><strong>Candidate Signature</strong></p>
                <p>${candidateName}</p>
            </div>
        </div>

        <div class="footer">
            <p>Company Name | HR Department | Strictly Confidential</p>
        </div>
    </body>
    </html>
    `;
};

module.exports = { getOfferLetterHTML };
