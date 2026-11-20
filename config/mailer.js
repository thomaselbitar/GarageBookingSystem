const nodemailer = require('nodemailer');

const isEmailConfigured = () => {
    return Boolean(
        process.env.EMAIL_HOST &&
        process.env.EMAIL_PORT &&
        process.env.EMAIL_USER &&
        process.env.EMAIL_PASSWORD &&
        process.env.EMAIL_FROM
    );
};

const createTransporter = () => {
    if (!isEmailConfigured()) {
        return null;
    }

    return nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: Number(process.env.EMAIL_PORT),
        secure: Number(process.env.EMAIL_PORT) === 465,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD
        }
    });
};

const buildBrandedOtpHtml = ({ heading, intro, codeLabel, otp, closing, ignoreNote }) => `
            <div style="margin:0;padding:0;background:#0a101b;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0a101b;">
                    <tr>
                        <td align="center" style="padding:32px 16px;">
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#121b2b;border:1px solid #2a3548;border-radius:20px;">
                                <tr>
                                    <td style="padding:8px 32px 0;border-radius:20px 20px 0 0;">
                                        <div style="height:4px;background:#ee7113;border-radius:999px;"></div>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:28px 32px 8px;font-family:Arial,Helvetica,sans-serif;">
                                        <p style="margin:0;letter-spacing:0.18em;text-transform:uppercase;color:#ee7113;font-size:12px;font-weight:bold;">AutoHub</p>
                                        <h1 style="margin:12px 0 0;font-size:28px;line-height:1.25;color:#ffffff;">${heading}</h1>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:16px 32px 8px;font-family:Arial,Helvetica,sans-serif;color:#b7c0ce;font-size:16px;line-height:1.65;">
                                        ${intro}
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:24px 32px;">
                                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0a101b;border:1px solid #2a3548;border-radius:16px;">
                                            <tr>
                                                <td align="center" style="padding:24px 20px;font-family:Arial,Helvetica,sans-serif;">
                                                    <p style="margin:0 0 12px;color:#97a3b8;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;">${codeLabel}</p>
                                                    <p style="margin:0;font-size:36px;line-height:1.2;letter-spacing:0.28em;font-weight:bold;color:#ee7113;">
                                                        ${otp}
                                                    </p>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:0 32px 8px;font-family:Arial,Helvetica,sans-serif;color:#97a3b8;font-size:14px;line-height:1.6;">
                                        This code expires in <strong style="color:#f6f3ec;">5 minutes</strong> and can only be used once.
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:16px 32px 8px;font-family:Arial,Helvetica,sans-serif;color:#d5dbe6;font-size:15px;line-height:1.65;">
                                        ${closing}
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:24px 32px 32px;font-family:Arial,Helvetica,sans-serif;border-top:1px solid #2a3548;">
                                        <p style="margin:0 0 8px;color:#ee7113;font-size:14px;font-weight:bold;">AutoHub – Your Car, Our Care.</p>
                                        <p style="margin:0;color:#7d8899;font-size:12px;line-height:1.6;">
                                            ${ignoreNote}
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </div>
        `;

const buildPasswordResetOtpEmail = (otp) => {
    return {
        subject: 'Reset your AutoHub password',
        text: [
            'Reset your AutoHub password',
            '',
            'Use this one-time code to reset your password and get back into your account.',
            '',
            `Your password reset code: ${otp}`,
            '',
            'This code expires in 5 minutes and can only be used once.',
            '',
            'Enter the code on the verification page to choose a new password.',
            '',
            'AutoHub – Your Car, Our Care.',
            '',
            'If you did not request a password reset, you can safely ignore this email.'
        ].join('\n'),
        html: buildBrandedOtpHtml({
            heading: 'Reset your password',
            intro: 'Use this one-time code to reset your password and get back into your account.',
            codeLabel: 'Your password reset code',
            otp,
            closing: 'Enter the code on the verification page to choose a new password.',
            ignoreNote: 'If you did not request a password reset, you can safely ignore this email.'
        })
    };
};

const buildSignupOtpEmail = (otp) => {
    return {
        subject: 'Welcome to AutoHub — your verification code',
        text: [
            'Welcome to AutoHub!',
            '',
            "We're excited to have you with us. Let's get your account ready so you can enjoy a smoother car care experience.",
            '',
            `Your email verification code: ${otp}`,
            '',
            'This code expires in 5 minutes and can only be used once.',
            '',
            "You're one step closer to taking better care of your car. We look forward to serving you!",
            '',
            'AutoHub – Your Car, Our Care.',
            '',
            'If you did not request this registration, you can safely ignore this email.'
        ].join('\n'),
        html: buildBrandedOtpHtml({
            heading: 'Welcome to AutoHub!',
            intro: "We're excited to have you with us. Let's get your account ready so you can enjoy a smoother car care experience.",
            codeLabel: 'Your email verification code',
            otp,
            closing: "You're one step closer to taking better care of your car. We look forward to serving you!",
            ignoreNote: 'If you did not request this registration, you can safely ignore this email.'
        })
    };
};

const buildOtpEmail = (otp, purpose) => {
    if (purpose === 'PASSWORD_RESET') {
        return buildPasswordResetOtpEmail(otp);
    }

    return buildSignupOtpEmail(otp);
};

const sendOtpEmail = async (email, otp, purpose) => {
    const transporter = createTransporter();

    if (!transporter) {
        const error = new Error('Email is not configured.');
        error.code = 'EMAIL_NOT_CONFIGURED';
        throw error;
    }

    const template = buildOtpEmail(otp, purpose);

    await transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: email,
        subject: template.subject,
        text: template.text,
        html: template.html
    });
};

module.exports = {
    isEmailConfigured,
    sendOtpEmail
};
