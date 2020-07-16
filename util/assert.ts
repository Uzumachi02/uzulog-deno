// Copyright 2018-2020 the Deno authors. All rights reserved. MIT license.

export class UzuLoggerInternalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UzuLoggerInternalError";
  }
}

/** Make an assertion, if not `true`, then throw. */
export function assert(expr: unknown, msg = ""): asserts expr {
  if (!expr) {
    throw new UzuLoggerInternalError(msg);
  }
}
