// Pages Function: forwards /api/* to the game Worker over a service binding, so the game has a single
// public origin and the Worker itself needs no public route.
interface Env {
  API: { fetch: (request: Request) => Promise<Response> };
}

export const onRequest = (ctx: { request: Request; env: Env }): Promise<Response> => ctx.env.API.fetch(ctx.request);
