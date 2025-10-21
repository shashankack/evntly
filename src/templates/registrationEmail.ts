// src/templates/registrationEmail.ts

export interface RegistrationEmailData {
	userName: string;
	activityName: string;
	organizationName: string;
	ticketCount: number;
	registrationDate: string;
	venueName?: string;
	additionalInfo?: string;
}

export function getRegistrationEmailHTML(data: RegistrationEmailData): string {
	const { userName, activityName, organizationName, ticketCount, registrationDate, venueName, additionalInfo } = data;

	return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Registration Confirmation</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f4f4f4;
        }
        .container {
            background-color: #ffffff;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            margin: -30px -30px 30px -30px;
            border-radius: 8px 8px 0 0;
        }
        .header h1 {
            margin: 0;
            font-size: 28px;
        }
        .ticket-info {
            background-color: #f8f9fa;
            border-radius: 6px;
            padding: 20px;
            margin: 20px 0;
        }
        .ticket-info .row {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid #e0e0e0;
        }
        .ticket-info .row:last-child {
            border-bottom: none;
        }
        .ticket-info .label {
            font-weight: 600;
            color: #666;
        }
        .ticket-info .value {
            color: #333;
        }
        .success-badge {
            background-color: #10b981;
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            display: inline-block;
            margin: 20px 0;
            font-weight: 600;
        }
        .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e0e0e0;
            font-size: 12px;
            color: #666;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>✅ Registration Confirmed!</h1>
        </div>

        <p>Dear <strong>${userName}</strong>,</p>

        <p>Thank you for registering! Your registration has been confirmed.</p>

        <div class="success-badge">
            ✓ Successfully Registered
        </div>

        <div class="ticket-info">
            <div class="row">
                <span class="label">Activity:</span>
                <span class="value">${activityName}</span>
            </div>
            <div class="row">
                <span class="label">Organized by:</span>
                <span class="value">${organizationName}</span>
            </div>
            <div class="row">
                <span class="label">Tickets:</span>
                <span class="value">${ticketCount}</span>
            </div>
            <div class="row">
                <span class="label">Registration Date:</span>
                <span class="value">${registrationDate}</span>
            </div>
            ${venueName ? `
            <div class="row">
                <span class="label">Venue:</span>
                <span class="value">${venueName}</span>
            </div>
            ` : ''}
        </div>

        ${additionalInfo ? `
        <div style="background-color: #e7f3ff; border-left: 4px solid #2196F3; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <strong>📌 Additional Information:</strong><br>
            ${additionalInfo}
        </div>
        ` : ''}

        <p>Please keep this email for your records. You may need to present it at the event.</p>

        <p>If you have any questions, please reply to this email.</p>

        <div class="footer">
            <p>Best regards,<br>${organizationName}</p>
            <p>&copy; ${new Date().getFullYear()} ${organizationName}. Powered by Evntly.</p>
        </div>
    </div>
</body>
</html>
    `.trim();
}

export function getRegistrationEmailSubject(activityName: string): string {
	return `✅ Registration Confirmed - ${activityName}`;
}
