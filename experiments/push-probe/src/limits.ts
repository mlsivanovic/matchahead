/** Cloudflare Workers limits, stranica ažurirana 5. septembra 2026. */

export const FREE_HTTP_CPU_MS = 10;
export const FREE_CRON_CPU_MS = 10;
export const FREE_REQUESTS_PER_DAY = 100_000;
export const FREE_SUBREQUESTS_PER_INVOCATION = 50;
export const FREE_CRON_TRIGGERS_PER_ACCOUNT = 5;
export const SECRET_VALUE_MAX_BYTES = 5 * 1024;
export const WORKER_STARTUP_LIMIT_MS = 1000;
export const FREE_SIMULTANEOUS_CONNECTIONS = 6;

export const SENDS_PER_REGISTRATION_PER_HOUR = 3;
export const SENDS_PER_WORKER_PER_UTC_DAY = 30;
export const REGISTRATIONS_PER_HOUR = 10;
export const AUTH_FAILURES_PER_HOUR = 20;

export interface PilotBudgetInput {
  cronPerDay: number;
  sendsPerDay: number;
  registrationsPerDay: number;
  firestoreReadsPerSend: number;
}

export interface PilotBudget {
  requests: number;
  fitsDailyRequestCap: boolean;
  subrequestsWarmSend: number;
  subrequestsColdSend: number;
  fitsSubrequestCap: boolean;
}

/** Topli slanje: keširan Google token, jedan FCM poziv. Hladno: razmena tokena + FCM. */
export function pilotRequestBudget(input: PilotBudgetInput): PilotBudget {
  const requests = input.cronPerDay + input.sendsPerDay + input.registrationsPerDay;
  const subrequestsWarmSend = 1 + input.firestoreReadsPerSend;
  const subrequestsColdSend = 2 + input.firestoreReadsPerSend;
  return {
    requests,
    fitsDailyRequestCap: requests <= FREE_REQUESTS_PER_DAY,
    subrequestsWarmSend,
    subrequestsColdSend,
    fitsSubrequestCap: subrequestsColdSend <= FREE_SUBREQUESTS_PER_INVOCATION,
  };
}
