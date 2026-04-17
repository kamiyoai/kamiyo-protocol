import { z } from 'zod';
import { defineTool, type Capability, type ToolDefinition } from '@kamiyo-org/agent';

export interface EmailConfig {
  transport: 'smtp' | 'resend';
  smtp?: { host: string; port: number; secure?: boolean; auth: { user: string; pass: string } };
  resendApiKey?: string;
  from: string;
}

const sendSchema = z.object({
  to: z.string().email(),
  subject: z.string(),
  body: z.string(),
  html: z.boolean().optional(),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
});

interface NodemailerModule {
  createTransport(opts: SmtpConfig): MailTransporter;
}

interface SmtpConfig {
  host: string;
  port: number;
  secure?: boolean;
  auth: { user: string; pass: string };
}

interface MailTransporter {
  sendMail(opts: {
    from: string;
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    text?: string;
    html?: string;
  }): Promise<{ messageId: string }>;
}

function loadNodemailer(): NodemailerModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    return require('nodemailer') as NodemailerModule;
  } catch {
    return null;
  }
}

export function emailCapability(config: EmailConfig): Capability {
  let transporter: MailTransporter | null = null;

  const tools: ToolDefinition[] = [
    defineTool({
      name: 'email_send',
      description: 'Send an email to a recipient.',
      schema: sendSchema,
      category: 'email',
      requiresApproval: true,
      handler: async input => {
        if (config.transport === 'resend') {
          return sendViaResend(config, input);
        }
        return sendViaSmtp(config, input, transporter);
      },
    }),
  ];

  return {
    name: 'email',
    description: 'Email sending tools',
    tools,
    async setup() {
      if (config.transport === 'smtp' && config.smtp) {
        const nodemailer = loadNodemailer();
        if (nodemailer) {
          transporter = nodemailer.createTransport(config.smtp);
        }
      }
    },
  };
}

async function sendViaSmtp(
  config: EmailConfig,
  input: z.infer<typeof sendSchema>,
  transporter: MailTransporter | null
): Promise<string> {
  if (!transporter) {
    const nodemailer = loadNodemailer();
    if (!nodemailer || !config.smtp)
      throw new Error('nodemailer not installed or SMTP not configured');
    transporter = nodemailer.createTransport(config.smtp);
  }

  const result = await transporter.sendMail({
    from: config.from,
    to: input.to,
    cc: input.cc?.join(', '),
    bcc: input.bcc?.join(', '),
    subject: input.subject,
    [input.html ? 'html' : 'text']: input.body,
  });

  return JSON.stringify({ sent: true, messageId: result.messageId });
}

async function sendViaResend(
  config: EmailConfig,
  input: z.infer<typeof sendSchema>
): Promise<string> {
  if (!config.resendApiKey) throw new Error('resendApiKey required for resend transport');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.from,
      to: [input.to],
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      [input.html ? 'html' : 'text']: input.body,
    }),
  });

  const data = (await res.json()) as { id?: string; message?: string };
  return JSON.stringify({ sent: res.ok, ...data });
}
