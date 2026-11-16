import nodemailer from 'nodemailer';
import type { Environment } from '../config/env.js';

export interface Mailer {
  sendPasswordReset(email: string, url: string): Promise<void>;
}
export function createMailer(env: Environment): Mailer {
  if (env.MAIL_TRANSPORT === 'console') {
    return {
      async sendPasswordReset(email, url) {
        // Explicit development-only delivery channel: never enabled in production.
        console.info('[NIMIMI DEV MAIL]', JSON.stringify({ to: email, resetUrl: url }));
      },
    };
  }
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    requireTLS: !env.SMTP_SECURE,
  });
  return {
    async sendPasswordReset(email, url) {
      await transport.sendMail({
        from: env.MAIL_FROM,
        to: email,
        subject: 'NIMIMI — Réinitialiser votre mot de passe',
        text: `Un changement de mot de passe a été demandé pour votre compte NIMIMI.\n\n${url}\n\nCe lien expire dans 30 minutes. Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.`,
      });
    },
  };
}
