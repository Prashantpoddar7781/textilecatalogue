import nodemailer from 'nodemailer';

const requireEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
};

const buildOtpEmail = (otp) => ({
  subject: 'Your ThreadX OTP',
  text: `Your ThreadX OTP is ${otp}. It is valid for 10 minutes.`,
  html: `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
      <h2>Your ThreadX OTP</h2>
      <p>Use this code to continue:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:16px 0">${otp}</p>
      <p>This OTP is valid for 10 minutes. If you did not request it, you can ignore this email.</p>
    </div>
  `
});

export async function sendOtpEmail(email, otp) {
  const host = requireEnv('SMTP_HOST');
  const port = Number(process.env.SMTP_PORT || 587);
  const user = requireEnv('SMTP_USER');
  const pass = requireEnv('SMTP_PASS');
  const from = process.env.SMTP_FROM || `ThreadX <${user}>`;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });
  const message = buildOtpEmail(otp);

  await transporter.sendMail({
    from,
    to: email,
    subject: message.subject,
    text: message.text,
    html: message.html
  });
}
