import * as TransportModule from 'winston-transport';

interface DatadogTransportOptions
  extends TransportModule.TransportStreamOptions {
  apiKey: string;
  hostname?: string;
  service?: string;
  ddsource?: string;
  ddtags?: string;
  intakeRegion?: 'eu' | 'us3' | 'us5' | 'default';
}

interface LogInfo {
  level: string;
  message: string;
  dd?: {
    trace_id: string;
    span_id: string;
  };
  ddtags?: string;
  [key: string]: unknown;
}

export class DatadogTransport extends TransportModule {
  private api: string;
  private opts: DatadogTransportOptions;

  constructor(opts: DatadogTransportOptions) {
    super(opts);

    if (!opts.apiKey) {
      throw new Error('Missing required option: `apiKey`');
    }

    this.opts = opts;

    const regions: Record<string, string> = {
      eu: 'https://http-intake.logs.datadoghq.eu',
      us3: 'https://http-intake.logs.us3.datadoghq.com',
      us5: 'https://http-intake.logs.us5.datadoghq.com',
      default: 'https://http-intake.logs.datadoghq.com',
    };

    const region = regions[opts.intakeRegion || 'default'] || regions.default;
    this.api = `${region}/v1/input/${opts.apiKey}`;
  }

  get name(): string {
    return 'datadog';
  }

  log(info: LogInfo, callback: () => void): void {
    setImmediate(() => {
      this.emit('logged', info);
    });

    const query: Record<string, string> = {};

    const queryKeys = ['service', 'ddsource', 'ddtags', 'hostname'] as const;
    for (const key of queryKeys) {
      if (this.opts[key]) {
        query[key] = this.opts[key];
      }
    }

    const { ddtags, ...logs } = info;

    const append = (str: string) => {
      query.ddtags = query.ddtags ? `${query.ddtags},${str}` : str;
    };

    if (info.dd) {
      append(`trace_id:${info.dd.trace_id},span_id:${info.dd.span_id}`);
    }
    if (ddtags) {
      append(ddtags);
    }

    const queryString = new URLSearchParams(query).toString();
    const apiUrl = queryString ? `${this.api}?${queryString}` : this.api;

    fetch(apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(logs),
    })
      .then((res) => {
        if (!res.ok) {
          console.error(`Datadog log delivery failed: HTTP ${res.status}`);
        }
      })
      .catch((err: unknown) => {
        const detail = err instanceof Error ? err.message : String(err);
        console.error('Datadog log delivery error:', detail);
      })
      .finally(() => {
        callback();
      });
  }
}
