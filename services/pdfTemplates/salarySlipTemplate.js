const salarySlipTemplate = (data) => {
    // data match new structure
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Helvetica', 'Arial', sans-serif; color: #333; line-height: 1.5; font-size: 14px; }
            .container { width: 100%; max-width: 800px; margin: 0 auto; padding: 20px; border: 1px solid #ccc; }
            .header { text-align: center; border-bottom: 2px solid #004d40; padding-bottom: 10px; margin-bottom: 20px; }
            .header h1 { margin: 0; color: #004d40; text-transform: uppercase; }
            .header h4 { margin: 5px 0; color: #555; }
            
            .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
            .meta-box { background: #f9f9f9; padding: 10px; border-radius: 4px; }
            .meta-row { display: flex; justify-content: space-between; margin-bottom: 5px; }
            .label { font-weight: bold; color: #555; }
            
            .salary-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            .salary-table th { background: #004d40; color: white; padding: 8px; text-align: left; }
            .salary-table td { border-bottom: 1px solid #eee; padding: 8px; }
            .col-right { text-align: right; }
            
            .net-pay { background: #e0f2f1; padding: 15px; margin-top: 20px; text-align: center; border-radius: 4px; }
            .net-pay-amount { font-size: 1.5em; font-weight: bold; color: #004d40; }
            
            .footer { margin-top: 30px; font-size: 12px; text-align: center; color: #777; border-top: 1px solid #eee; padding-top: 10px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>${data.companyName}</h1>
                <h4>Salary Slip for ${data.month} ${data.year}</h4>
                <p>${data.branchName}</p>
            </div>

            <div class="meta-grid">
                <div class="meta-box">
                    <div class="meta-row"><span class="label">Employee Name:</span> <span>${data.employee.name}</span></div>
                    <div class="meta-row"><span class="label">Employee ID:</span> <span>${data.employee.id}</span></div>
                    <div class="meta-row"><span class="label">Designation:</span> <span>${data.employee.role}</span></div>
                </div>
                <div class="meta-box">
                    <div class="meta-row"><span class="label">PAN Number:</span> <span>${data.employee.pan || 'N/A'}</span></div>
                    <div class="meta-row"><span class="label">PF Account:</span> <span>${data.employee.pfAccount || 'N/A'}</span></div>
                    <div class="meta-row"><span class="label">Bank Account:</span> <span>${data.employee.bankAccount || 'N/A'}</span></div>
                </div>
            </div>

            <table class="salary-table">
                <thead>
                    <tr>
                        <th width="50%">Earnings</th>
                        <th width="50%" class="col-right">Amount (₹)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr><td>Basic Salary</td><td class="col-right">${data.earnings.base.toFixed(2)}</td></tr>
                    <tr><td>HRA</td><td class="col-right">${data.earnings.hra.toFixed(2)}</td></tr>
                    <tr><td>Conveyance</td><td class="col-right">${data.earnings.conveyance.toFixed(2)}</td></tr>
                    <tr><td>Special Allowance</td><td class="col-right">${data.earnings.special.toFixed(2)}</td></tr>
                    <tr style="font-weight: bold; background: #fff;">
                        <td>Gross Salary</td>
                        <td class="col-right">${data.earnings.gross.toFixed(2)}</td>
                    </tr>
                </tbody>
            </table>

            <table class="salary-table" style="margin-top: 20px;">
                <thead>
                    <tr>
                        <th width="50%">Deductions</th>
                        <th width="50%" class="col-right">Amount (₹)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr><td>PF (Employee)</td><td class="col-right">${data.deductions.pf.toFixed(2)}</td></tr>
                    <tr><td>Professional Tax</td><td class="col-right">${data.deductions.pt.toFixed(2)}</td></tr>
                    <tr><td>TDS (Income Tax)</td><td class="col-right">${data.deductions.tds.toFixed(2)}</td></tr>
                    <tr><td>Discipline Deduction (Absent/Half-Day)</td><td class="col-right">${data.deductions.discipline.toFixed(2)}</td></tr>
                    <tr style="font-weight: bold; background: #fff; color: #d32f2f;">
                        <td>Total Deductions</td>
                        <td class="col-right">${data.deductions.total.toFixed(2)}</td>
                    </tr>
                </tbody>
            </table>

            <div class="net-pay">
                <div>Net Salary Payable</div>
                <div class="net-pay-amount">₹ ${data.netSalary.toFixed(2)}</div>
            </div>

            <div class="footer">
                This is a computer-generated document and does not require a signature.<br>
                Generated on: ${data.generatedDate}
            </div>
        </div>
    </body>
    </html>
    `;
};

module.exports = salarySlipTemplate;
