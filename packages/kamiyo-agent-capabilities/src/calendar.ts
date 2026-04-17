import { z } from 'zod';
import { defineTool, type Capability, type ToolDefinition } from '@kamiyo-org/agent';

export interface CalendarConfig {
  provider: 'google' | 'custom';
  apiKey?: string;
  calendarId?: string;
  customEndpoint?: string;
  authToken?: string;
}

const createSchema = z.object({
  title: z.string(),
  start: z.string(),
  end: z.string(),
  description: z.string().optional(),
  location: z.string().optional(),
  attendees: z.array(z.string().email()).optional(),
});

const listSchema = z.object({
  from: z.string(),
  to: z.string(),
  maxResults: z.number().int().min(1).max(100).optional(),
});

const remindSchema = z.object({
  eventId: z.string(),
  minutesBefore: z.number().int().min(1).max(10080),
});

export function calendarCapability(config: CalendarConfig): Capability {
  const tools: ToolDefinition[] = [
    defineTool({
      name: 'calendar_create',
      description: 'Create a calendar event.',
      schema: createSchema,
      category: 'calendar',
      requiresApproval: true,
      handler: async input => {
        if (config.provider === 'google') {
          return googleCreateEvent(config, input);
        }
        return customCreateEvent(config, input);
      },
    }),
    defineTool({
      name: 'calendar_list',
      description: 'List calendar events within a date range.',
      schema: listSchema,
      category: 'calendar',
      handler: async input => {
        if (config.provider === 'google') {
          return googleListEvents(config, input);
        }
        return customListEvents(config, input);
      },
    }),
    defineTool({
      name: 'calendar_remind',
      description: 'Set a reminder for a calendar event.',
      schema: remindSchema,
      category: 'calendar',
      handler: async input => {
        return JSON.stringify({
          set: true,
          eventId: input.eventId,
          minutesBefore: input.minutesBefore,
        });
      },
    }),
  ];

  return { name: 'calendar', description: 'Calendar event management tools', tools };
}

async function googleCreateEvent(
  config: CalendarConfig,
  input: z.infer<typeof createSchema>
): Promise<string> {
  const calId = config.calendarId ?? 'primary';
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calId}/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: input.title,
      start: { dateTime: input.start },
      end: { dateTime: input.end },
      description: input.description,
      location: input.location,
      attendees: input.attendees?.map(email => ({ email })),
    }),
  });
  return JSON.stringify(await res.json());
}

async function googleListEvents(
  config: CalendarConfig,
  input: z.infer<typeof listSchema>
): Promise<string> {
  const calId = config.calendarId ?? 'primary';
  const params = new URLSearchParams({
    timeMin: input.from,
    timeMax: input.to,
    maxResults: String(input.maxResults ?? 10),
    singleEvents: 'true',
    orderBy: 'startTime',
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calId}/events?${params}`,
    { headers: { Authorization: `Bearer ${config.authToken}` } }
  );
  return JSON.stringify(await res.json());
}

async function customCreateEvent(
  config: CalendarConfig,
  input: z.infer<typeof createSchema>
): Promise<string> {
  if (!config.customEndpoint) throw new Error('customEndpoint required');
  const res = await fetch(`${config.customEndpoint}/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {}),
    },
    body: JSON.stringify(input),
  });
  return JSON.stringify(await res.json());
}

async function customListEvents(
  config: CalendarConfig,
  input: z.infer<typeof listSchema>
): Promise<string> {
  if (!config.customEndpoint) throw new Error('customEndpoint required');
  const params = new URLSearchParams({
    from: input.from,
    to: input.to,
    limit: String(input.maxResults ?? 10),
  });
  const res = await fetch(`${config.customEndpoint}/events?${params}`, {
    headers: config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {},
  });
  return JSON.stringify(await res.json());
}
