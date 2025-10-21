// src/templates/secretKeyEmail.ts

export interface SecretKeyEmailData {
	organizationName: string;
	secretKey: string;
	expiryDate: string;
	isRotation: boolean;
}

export function getSecretKeyEmailHTML(data: SecretKeyEmailData): string {
	const { organizationName, secretKey, expiryDate, isRotation } = data;
	const action = isRotation ? 'rotated' : 'generated';

	return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your Evntly Secret Key</title>
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
        }
        .header h1 {
            color: #4F46E5;
            margin: 0;
        }
        .key-box {
            background-color: #f8f9fa;
            border: 2px solid #4F46E5;
            border-radius: 6px;
            padding: 20px;
            margin: 20px 0;
            word-break: break-all;
            font-family: 'Courier New', monospace;
            font-size: 14px;
        }
        .warning {
            background-color: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
        }
        .info {
            background-color: #e7f3ff;
            border-left: 4px solid #2196F3;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
        }
        .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e0e0e0;
            font-size: 12px;
            color: #666;
            text-align: center;
        }
        .button {
            display: inline-block;
            padding: 12px 24px;
            background-color: #4F46E5;
            color: #ffffff;
            text-decoration: none;
            border-radius: 6px;
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 Evntly</h1>
            <p>Your Secret Key Has Been ${action.charAt(0).toUpperCase() + action.slice(1)}</p>
        </div>

        <p>Hello <strong>${organizationName}</strong>,</p>

        <p>${isRotation 
			? 'Your secret key has been automatically rotated for security purposes.' 
			: 'Your new secret key has been generated successfully.'
		}</p>

        <div class="key-box">
            <strong>Your Secret Key:</strong><br><br>
            ${secretKey}
        </div>

        <div class="warning">
            <strong>⚠️ Important Security Information:</strong>
            <ul style="margin: 10px 0;">
                <li>Keep this key secure and confidential</li>
                <li>Never share it with anyone</li>
                <li>Do not commit it to version control</li>
                <li>Store it in a secure password manager</li>
            </ul>
        </div>

        <div class="info">
            <strong>📅 Key Details:</strong>
            <ul style="margin: 10px 0;">
                <li><strong>Expiry Date:</strong> ${expiryDate}</li>
                <li><strong>Validity:</strong> 14 days</li>
                <li><strong>Auto-Rotation:</strong> Every 14 days</li>
            </ul>
        </div>

        <p><strong>How to use this key:</strong></p>
        <ol>
            <li>Include this key in the <code>x-secret-key</code> header of your API requests</li>
            <li>Example: <code>x-secret-key: ${secretKey.substring(0, 20)}...</code></li>
            <li>Update your application before the expiry date</li>
        </ol>

        <p>If you did not request this ${isRotation ? 'rotation' : 'key'} or have security concerns, please contact support immediately.</p>

        <div class="footer">
            <p>This is an automated message from Evntly System</p>
            <p>&copy; ${new Date().getFullYear()} Evntly. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
    `.trim();
}

export function getSecretKeyEmailSubject(isRotation: boolean): string {
	return isRotation 
		? '🔄 Your Evntly Secret Key Has Been Rotated' 
		: '🔑 Your New Evntly Secret Key';
}
