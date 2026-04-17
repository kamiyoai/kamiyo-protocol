# @kamiyo-org/agent-capabilities

Built-in capabilities for [`@kamiyo-org/agent`](../kamiyo-agent). HTTP, web, email, files, code execution, calendar, communication, and payments.

## Install

```bash
npm install @kamiyo-org/agent-capabilities
```

Each capability has optional peer dependencies — install only what you use:

```bash
npm install playwright    # web capability
npm install nodemailer    # email capability
npm install stripe        # payments capability
```

## Usage

```typescript
import { createAgent } from '@kamiyo-org/agent';
import { httpCapability, filesCapability } from '@kamiyo-org/agent-capabilities';

const agent = createAgent({ id: 'my-agent', provider });

agent.use(httpCapability());
agent.use(filesCapability({ rootDir: './data' }));

const result = await agent.run('Fetch https://api.example.com/data and save to output.json');
```

## Capabilities

### HTTP

Make HTTP requests. No additional dependencies.

```typescript
import { httpCapability } from '@kamiyo-org/agent-capabilities';

agent.use(httpCapability({
  allowedHosts: ['api.example.com'],  // optional allowlist
  defaultHeaders: { 'X-Api-Key': '...' },
  timeout: 10_000,
}));
```

**Tools:** `http_get`, `http_post`, `http_put`, `http_delete`

### Files

Read, write, list, and search files within a sandboxed root directory.

```typescript
import { filesCapability } from '@kamiyo-org/agent-capabilities';

agent.use(filesCapability({
  rootDir: './workspace',
  allowWrite: true,
  maxFileSize: 5 * 1024 * 1024, // 5MB (default: 10MB)
}));
```

**Tools:** `file_read`, `file_write`, `file_list`, `file_search`

Path traversal and symlink escapes are blocked.

### Web

Browse, search, scrape, and screenshot web pages. Requires `playwright`.

```typescript
import { webCapability } from '@kamiyo-org/agent-capabilities';

agent.use(webCapability({
  headless: true,      // default: true
  timeout: 30_000,
  allowedHosts: ['example.com'],
}));
```

**Tools:** `web_browse`, `web_search`, `web_scrape`, `web_screenshot`

### Email

Send emails. Requires `nodemailer`.

```typescript
import { emailCapability } from '@kamiyo-org/agent-capabilities';

agent.use(emailCapability({
  from: 'agent@example.com',
  transport: {
    host: 'smtp.example.com',
    port: 587,
    auth: { user: '...', pass: '...' },
  },
}));
```

**Tools:** `email_send`

### Code

Execute JavaScript/TypeScript in a sandboxed VM.

```typescript
import { codeCapability } from '@kamiyo-org/agent-capabilities';

agent.use(codeCapability({
  timeout: 5_000,
  allowedModules: ['lodash', 'date-fns'],
}));
```

**Tools:** `code_execute`, `code_eval`

### Calendar

Google Calendar integration. Requires `googleapis`.

```typescript
import { calendarCapability } from '@kamiyo-org/agent-capabilities';

agent.use(calendarCapability({
  google: {
    credentials: { ... },
    calendarId: 'primary',
  },
}));
```

**Tools:** `calendar_create`, `calendar_list`, `calendar_remind`

### Communication

Send messages to Slack, Discord, and Telegram.

```typescript
import { communicationCapability } from '@kamiyo-org/agent-capabilities';

agent.use(communicationCapability({
  slack: { token: 'xoxb-...', defaultChannel: '#general' },
  discord: { token: '...', defaultChannel: '...' },
  telegram: { token: '...', defaultChatId: '...' },
}));
```

**Tools:** `slack_send`, `discord_send`, `telegram_send`

Only tools for configured services are registered. Warns if no services configured.

### Payments

Stripe payment and invoice tools. Requires `stripe`.

```typescript
import { paymentsCapability } from '@kamiyo-org/agent-capabilities';

agent.use(paymentsCapability({
  stripe: { secretKey: 'sk_...' },
}));
```

**Tools:** `stripe_charge`, `stripe_invoice`, `stripe_list_charges`

All payment tools require approval (`requiresApproval: true`).

## Custom capabilities

Build your own alongside built-in ones:

```typescript
import { defineTool, type Capability } from '@kamiyo-org/agent';
import { z } from 'zod';

const myCapability: Capability = {
  name: 'my-tools',
  tools: [
    defineTool({
      name: 'my_action',
      description: 'Do something custom',
      schema: z.object({ input: z.string() }),
      handler: async (input) => `Result: ${input.input}`,
    }),
  ],
};

agent.use(myCapability);
```

## All tools at a glance

| Capability | Tools | Peer deps |
|---|---|---|
| http | `http_get`, `http_post`, `http_put`, `http_delete` | none |
| files | `file_read`, `file_write`, `file_list`, `file_search` | none |
| web | `web_browse`, `web_search`, `web_scrape`, `web_screenshot` | playwright |
| email | `email_send` | nodemailer |
| code | `code_execute`, `code_eval` | none |
| calendar | `calendar_create`, `calendar_list`, `calendar_remind` | googleapis |
| communication | `slack_send`, `discord_send`, `telegram_send` | none |
| payments | `stripe_charge`, `stripe_invoice`, `stripe_list_charges` | stripe |

## License

MIT
