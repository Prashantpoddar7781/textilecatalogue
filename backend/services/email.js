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

const sendWithTimeout = async (work, timeoutMs = 12000) => {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Email provider timed out')), timeoutMs);
  });

  try {
    return await Promise.race([work(), timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
};

async function sendViaResend(email, otp) {
  const apiKey = requireEnv('RESEND_API_KEY');
  const from = process.env.RESEND_FROM || process.env.SMTP_FROM || 'ThreadX <onboarding@resend.dev>';
  const message = buildOtpEmail(otp);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: message.subject,
      html: message.html,
      text: message.text
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Resend failed (${response.status}): ${body.slice(0, 160)}`);
  }
}

async function sendViaSmtp(email, otp) {
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
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
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

export async function sendOtpEmail(email, otp) {
  const provider = (process.env.EMAIL_PROVIDER || (process.env.RESEND_API_KEY ? 'resend' : 'smtp')).toLowerCase();

  if (provider === 'resend') {
    await sendWithTimeout(() => sendViaResend(email, otp));
    return;
  }

  if (provider === 'smtp') {
    await sendWithTimeout(() => sendViaSmtp(email, otp));
    return;
  }

  throw new Error('EMAIL_PROVIDER must be resend or smtp');
}
