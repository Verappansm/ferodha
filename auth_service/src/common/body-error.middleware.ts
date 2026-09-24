import type { NextFunction, Request, Response } from 'express';
import { envelopeForStatus, normaliseStatus } from './error-envelope';

/**
 * A body Express cannot parse never reaches a Nest handler - body-parser
 * throws first - so no exception filter can shape it. This error middleware is
 * registered after `app.init()`, i.e. behind body-parser and the router, so an
 * unparsable JSON body still leaves the way every other failure does: VAL-422
 * in the platform envelope.
 *
 * Registration order matters: middleware is consulted in the order it was
 * added, and only a layer registered *after* the parser sees the parser's
 * error.
 */
export function bodyErrorMiddleware(
  error: { status?: number; statusCode?: number; type?: string } | undefined,
  _request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (response.headersSent) {
    next(error);
    return;
  }

  const status = error?.status ?? error?.statusCode ?? 500;
  // "entity.parse.failed" is body-parser saying the JSON was malformed - the
  // same class of failure as a field the schema refuses, so the same answer.
  const invalidInput = error?.type === 'entity.parse.failed' || status === 400;
  const envelopeStatus = invalidInput
    ? normaliseStatus(400)
    : normaliseStatus(status);

  response.status(envelopeStatus).json(envelopeForStatus(envelopeStatus));
}
