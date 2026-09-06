import {
  CreateConfigurationSetCommand,
  CreateConfigurationSetEventDestinationCommand,
  GetConfigurationSetCommand,
  GetConfigurationSetEventDestinationsCommand,
  SESv2Client,
} from '@aws-sdk/client-sesv2';
import {
  describeSesConfigGap,
  sesConfigurationSetName,
  sesEventLoopConfigured,
  sesFromEmail,
  sesIsConfigured,
  sesRegion,
  sesSnsTopicArn,
} from './email-provider';

export { sesConfigurationSetName, sesEventLoopConfigured, sesSnsTopicArn } from './email-provider';

export const SES_EVENT_TYPES = ['SEND', 'DELIVERY', 'BOUNCE', 'COMPLAINT', 'REJECT'] as const;

export function sesEventLoopEnvGap(): string[] {
  const missing: string[] = [];
  if (!sesIsConfigured()) missing.push(...describeSesConfigGap());
  if (!sesFromEmail()) missing.push('SES_FROM_EMAIL');
  if (!sesRegion()) missing.push('AWS_REGION');
  if (!sesConfigurationSetName()) missing.push('SES_CONFIGURATION_SET');
  if (!sesSnsTopicArn()) missing.push('SES_SNS_TOPIC_ARN');
  return [...new Set(missing)];
}

function sesClient(): SESv2Client | null {
  if (!sesIsConfigured()) return null;
  const accessKeyId = (process.env.AWS_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY || '').trim();
  return new SESv2Client({
    region: sesRegion(),
    ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
  });
}

export type SesEventLoopStatus = {
  configurationSet: string;
  snsTopicArn: string;
  exists: boolean;
  eventDestinationOk: boolean;
  matchingEventTypes: string[];
  missingEventTypes: string[];
  error?: string;
};

export async function inspectSesEventLoop(): Promise<SesEventLoopStatus | null> {
  const configurationSet = sesConfigurationSetName();
  const snsTopicArn = sesSnsTopicArn();
  if (!configurationSet || !snsTopicArn || !sesIsConfigured()) return null;

  const client = sesClient();
  if (!client) return null;

  try {
    await client.send(new GetConfigurationSetCommand({ ConfigurationSetName: configurationSet }));
  } catch {
    return {
      configurationSet,
      snsTopicArn,
      exists: false,
      eventDestinationOk: false,
      matchingEventTypes: [],
      missingEventTypes: [...SES_EVENT_TYPES],
    };
  }

  try {
    const dests = await client.send(
      new GetConfigurationSetEventDestinationsCommand({ ConfigurationSetName: configurationSet }),
    );
    const destinations = dests.EventDestinations ?? [];
    const snsDest = destinations.find(
      (d) => d.SnsDestination?.TopicArn === snsTopicArn && d.Enabled !== false,
    );
    const matching = (snsDest?.MatchingEventTypes ?? []).map((t) => String(t).toUpperCase());
    const missingEventTypes = SES_EVENT_TYPES.filter((t) => !matching.includes(t));
    return {
      configurationSet,
      snsTopicArn,
      exists: true,
      eventDestinationOk: Boolean(snsDest) && missingEventTypes.length === 0,
      matchingEventTypes: matching,
      missingEventTypes,
    };
  } catch (err) {
    return {
      configurationSet,
      snsTopicArn,
      exists: true,
      eventDestinationOk: false,
      matchingEventTypes: [],
      missingEventTypes: [...SES_EVENT_TYPES],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export type ProvisionSesEventLoopResult = {
  createdConfigurationSet: boolean;
  createdEventDestination: boolean;
  status: SesEventLoopStatus;
};

/** Ensure Configuration Set + SNS event destination exist (requires AWS credentials at runtime). */
export async function provisionSesEventLoop(): Promise<ProvisionSesEventLoopResult | null> {
  const configurationSet = sesConfigurationSetName();
  const snsTopicArn = sesSnsTopicArn();
  if (!configurationSet || !snsTopicArn || !sesIsConfigured()) return null;

  const client = sesClient();
  if (!client) return null;

  let createdConfigurationSet = false;
  let createdEventDestination = false;

  try {
    await client.send(new GetConfigurationSetCommand({ ConfigurationSetName: configurationSet }));
  } catch {
    await client.send(new CreateConfigurationSetCommand({ ConfigurationSetName: configurationSet }));
    createdConfigurationSet = true;
  }

  const destName = 'marketingautoaz-sns-events';
  const existing = await client.send(
    new GetConfigurationSetEventDestinationsCommand({ ConfigurationSetName: configurationSet }),
  );
  const snsDest = (existing.EventDestinations ?? []).find(
    (d) => d.Name === destName || d.SnsDestination?.TopicArn === snsTopicArn,
  );

  if (!snsDest) {
    await client.send(
      new CreateConfigurationSetEventDestinationCommand({
        ConfigurationSetName: configurationSet,
        EventDestinationName: destName,
        EventDestination: {
          Enabled: true,
          MatchingEventTypes: [...SES_EVENT_TYPES],
          SnsDestination: { TopicArn: snsTopicArn },
        },
      }),
    );
    createdEventDestination = true;
  }

  const status = (await inspectSesEventLoop())!;
  return { createdConfigurationSet, createdEventDestination, status };
}
