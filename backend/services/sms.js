const requireEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
};

const buildOtpMessage = (otp) => `Your ThreadX OTP is ${otp}. It is valid for 10 minutes.`;

async function sendViaFast2Sms(mobileNumber, otp) {
  const apiKey = requireEnv('FAST2SMS_API_KEY');
  const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
    method: 'POST',
    headers: {
      authorization: apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      route: process.env.FAST2SMS_ROUTE || 'otp',
      variables_values: otp,
      numbers: mobileNumber.replace(/^\+91/, '')
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Fast2SMS failed (${response.status}): ${body.slice(0, 120)}`);
  }
}

async function sendViaMsg91(mobileNumber, otp) {
  const authKey = requireEnv('MSG91_AUTH_KEY');
  const templateId = requireEnv('MSG91_OTP_TEMPLATE_ID');
  const response = await fetch('https://control.msg91.com/api/v5/otp', {
    method: 'POST',
    headers: {
      authkey: authKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      template_id: templateId,
      mobile: mobileNumber.replace(/^\+/, ''),
      otp
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`MSG91 failed (${response.status}): ${body.slice(0, 120)}`);
  }
}

async function sendViaTwilio(mobileNumber, otp) {
  const accountSid = requireEnv('TWILIO_ACCOUNT_SID');
  const authToken = requireEnv('TWILIO_AUTH_TOKEN');
  const from = requireEnv('TWILIO_FROM_NUMBER');
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const params = new URLSearchParams({
    To: mobileNumber,
    From: from,
    Body: buildOtpMessage(otp)
  });

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Twilio failed (${response.status}): ${body.slice(0, 120)}`);
  }
}

export async function sendOtpSms(mobileNumber, otp) {
  const provider = (process.env.SMS_PROVIDER || '').toLowerCase();

  if (provider === 'fast2sms') {
    await sendViaFast2Sms(mobileNumber, otp);
    return;
  }
  if (provider === 'msg91') {
    await sendViaMsg91(mobileNumber, otp);
    return;
  }
  if (provider === 'twilio') {
    await sendViaTwilio(mobileNumber, otp);
    return;
  }
  if (provider === 'console' && process.env.NODE_ENV !== 'production') {
    console.log(`ThreadX OTP for ${mobileNumber}: ${otp}`);
    return;
  }

  throw new Error('SMS provider is not configured');
}
