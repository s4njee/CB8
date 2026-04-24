/**
 * emailSender.ts — Pluggable email delivery.
 *
 * The default sender logs the message to stdout, which is enough to build and
 * test verification / reset / magic-link flows without any external setup.
 * Swap via setEmailSender() to point at Resend, SMTP (nodemailer), SES, etc.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Optional HTML body. Falls back to `text` when absent. */
  html?: string;
}

export type EmailSender = (msg: EmailMessage) => Promise<void>;

const consoleSender: EmailSender = async (msg) => {
  const sep = '─'.repeat(60);
  console.log(
    `\n[CB8 email]\n${sep}\nTo:      ${msg.to}\nSubject: ${msg.subject}\n${sep}\n${msg.text}\n${sep}\n`,
  );
};

let sender: EmailSender = consoleSender;

export function setEmailSender(next: EmailSender): void {
  sender = next;
}

export function sendEmail(msg: EmailMessage): Promise<void> {
  return sender(msg);
}
