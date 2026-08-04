const nodemailer = require('nodemailer');
const host = process.env.SMTP_HOST;
const user = process.env.SMTP_USER;
const pass = (process.env.SMTP_PASS || '').replace(/\s+/g, '');
const port = Number(process.env.SMTP_PORT || 587);
console.log({ host, user, port, passLen: pass.length });
const t = nodemailer.createTransport({
  host,
  port,
  secure: port === 465,
  auth: { user, pass },
});
t.sendMail({
  from: `MarketingSpa <${user}>`,
  to: 'xuanluongmarketing@gmail.com',
  subject: 'Test SMTP MarketingSpa',
  text: 'SMTP OK. Hay bam Gui lai ma tren form dang ky de nhan OTP moi.',
})
  .then((i) => {
    console.log('sent', i.messageId);
  })
  .catch((e) => {
    console.error('fail', e.message);
    process.exit(1);
  });
