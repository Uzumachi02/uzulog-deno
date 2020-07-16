// Copyright 2018-2020 the Deno authors. All rights reserved. MIT license.
import { Logger, LoggerCategory } from "./logger.ts";
import {
  BaseHandler,
  ConsoleHandler,
  WriterHandler,
  FileHandler,
  RotatingFileHandler,
} from "./handlers.ts";
import { assert } from "./util/assert.ts";
import type { LevelName } from "./levels.ts";

export { LogLevels, LevelName } from "./levels.ts";
export { Logger } from "./logger.ts";

export class LoggerConfig {
  level?: LevelName;
  handlers?: string[];
}

export interface LogConfig {
  handlers?: {
    [name: string]: BaseHandler;
  };
  loggers?: {
    [name: string]: LoggerConfig;
  };
}

const DEFAULT_LEVEL = "INFO";
const DEFAULT_CONFIG: LogConfig = {
  handlers: {
    default: new ConsoleHandler(DEFAULT_LEVEL),
  },

  loggers: {
    default: {
      level: DEFAULT_LEVEL,
      handlers: ["default"],
    },
  },
};

const state = {
  handlers: new Map<string, BaseHandler>(),
  loggers: new Map<string, Logger>(),
  config: DEFAULT_CONFIG,
};

export const handlers = {
  BaseHandler,
  ConsoleHandler,
  WriterHandler,
  FileHandler,
  RotatingFileHandler,
};

export function getLogger(name?: string): Logger {
  if (!name) {
    const d = state.loggers.get("default");
    assert(
      d != null,
      `"default" logger must be set for getting logger without name`,
    );
    return d;
  }
  const result = state.loggers.get(name);
  if (!result) {
    const logger = new Logger(name, "NOTSET", { handlers: [] });
    state.loggers.set(name, logger);
    return logger;
  }
  return result;
}

export function createCategoryLogger(
  category: string = "default",
  nameLogger?: string,
) {
  return new LoggerCategory(category, getLogger(nameLogger));
}

export function debug(...args: unknown[]): string | undefined {
  return getLogger("default").debug(...args);
}

export function debugFormat(
  format: string,
  ...args: unknown[]
): string | undefined {
  return getLogger("default").debugFormat(format, ...args);
}

export function info(...args: unknown[]): string | undefined {
  return getLogger("default").info(...args);
}

export function infoFormat(
  format: string,
  ...args: unknown[]
): string | undefined {
  return getLogger("default").infoFormat(format, ...args);
}

export function warning(...args: unknown[]): string | undefined {
  return getLogger("default").warning(...args);
}

export function warningFormat(
  format: string,
  ...args: unknown[]
): string | undefined {
  return getLogger("default").warningFormat(format, ...args);
}

export function error(...args: unknown[]): string | undefined {
  return getLogger("default").error(...args);
}

export function errorFormat(
  format: string,
  ...args: unknown[]
): string | undefined {
  return getLogger("default").errorFormat(format, ...args);
}

export function critical(...args: unknown[]): string | undefined {
  return getLogger("default").critical(...args);
}

export function criticalFormat(
  format: string,
  ...args: unknown[]
): string | undefined {
  return getLogger("default").criticalFormat(format, ...args);
}

export async function setup(config: LogConfig): Promise<void> {
  state.config = {
    handlers: { ...DEFAULT_CONFIG.handlers, ...config.handlers },
    loggers: { ...DEFAULT_CONFIG.loggers, ...config.loggers },
  };

  // tear down existing handlers
  state.handlers.forEach((handler): void => {
    handler.destroy();
  });
  state.handlers.clear();

  // setup handlers
  const handlers = state.config.handlers || {};

  for (const handlerName in handlers) {
    const handler = handlers[handlerName];
    await handler.setup();
    state.handlers.set(handlerName, handler);
  }

  // remove existing loggers
  state.loggers.clear();

  // setup loggers
  const loggers = state.config.loggers || {};
  for (const loggerName in loggers) {
    const loggerConfig = loggers[loggerName];
    const handlerNames = loggerConfig.handlers || [];
    const handlers: BaseHandler[] = [];

    handlerNames.forEach((handlerName): void => {
      const handler = state.handlers.get(handlerName);
      if (handler) {
        handlers.push(handler);
      }
    });

    const levelName = loggerConfig.level || DEFAULT_LEVEL;
    const logger = new Logger(loggerName, levelName, { handlers: handlers });
    state.loggers.set(loggerName, logger);
  }
}

await setup(DEFAULT_CONFIG);
