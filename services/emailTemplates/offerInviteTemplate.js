const generateOfferInviteEmail = (invite, registrationLink, branchName, shiftName) => {
    const shiftInfo = shiftName ? `<li><strong>Assigned Shift:</strong> ${shiftName}</li>` : '';

    return `
        <h1>Job Offer & Invitation to Join</h1>
        <p>Dear ${invite.name},</p>
        
        <p>We are pleased to invite you to join our team at <strong>${branchName}</strong>.</p>
        
        <p>To accept this offer and complete your registration, please click the link below:</p>
        
        <p align="center">
            <a href="${registrationLink}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                Complete Registration
            </a>
        </p>
        
        <h3>Offer Details:</h3>
        <ul>
            <li><strong>Branch:</strong> ${branchName}</li>
            ${shiftInfo}
        </ul>
        
        <p><strong>Note:</strong> This invitation link is valid for 7 days. Please register before it expires.</p>
        
        <p>If you have any questions, please contact HR.</p>
        
        <br>
        <p>Best Regards,</p>
        <p><strong>HR Team</strong></p>
    `;
};

module.exports = { generateOfferInviteEmail };
