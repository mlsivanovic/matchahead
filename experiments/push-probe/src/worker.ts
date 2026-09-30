import { createProbeApp, type ProbeEnv } from './app.ts';
import { ProbeDirectoryObject } from './directory-object.ts';

const app = createProbeApp();

export { ProbeDirectoryObject };

export default {
  fetch(request: Request, env: ProbeEnv): Promise<Response> {
    return app.fetch(request, env);
  },
  scheduled(_event: unknown, env: ProbeEnv) {
    return app.scheduled(env);
  },
};
