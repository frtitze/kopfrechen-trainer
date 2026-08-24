import worker from '../../stats-worker/src/index';

type WorkerEnv = Parameters<typeof worker.fetch>[1];

export const onRequest: PagesFunction<WorkerEnv> = async ({ request, env }) =>
  worker.fetch(request, env);
