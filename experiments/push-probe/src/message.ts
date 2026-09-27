import { clickPathOf } from './click.ts';
import { isFirebaseInstallationId } from './ids.ts';

export const SYNTHETIC_TITLE = 'MatchAhead proba';
export const SYNTHETIC_BODY = 'Sintetička poruka. Ovo nije utakmica.';

export interface SyntheticFcmRequest {
  message: {
    fid: string;
    notification: { title: string; body: string };
    data: { kind: string; probeMessageId: string; clickPath: string };
    webpush: {
      headers: { Urgency: string; TTL: string };
      notification: { icon: string };
      fcm_options: { link: string };
    };
  };
}

export function syntheticFcmMessage(input: {
  fid: string;
  probeMessageId: string;
  clickUrl: string;
  iconUrl: string;
}): SyntheticFcmRequest {
  if (!isFirebaseInstallationId(input.fid)) {
    throw new Error('invalid_fid');
  }
  const request: SyntheticFcmRequest = {
    message: {
      fid: input.fid,
      notification: {
        title: SYNTHETIC_TITLE,
        body: SYNTHETIC_BODY,
      },
      data: {
        kind: 'synthetic-probe',
        probeMessageId: input.probeMessageId,
        clickPath: clickPathOf(input.clickUrl),
      },
      webpush: {
        headers: {
          Urgency: 'high',
          TTL: '300',
        },
        notification: {
          icon: input.iconUrl,
        },
        fcm_options: {
          link: input.clickUrl,
        },
      },
    },
  };
  if ('token' in request.message || 'topic' in request.message || 'condition' in request.message) {
    throw new Error('mixed_target');
  }
  return request;
}
