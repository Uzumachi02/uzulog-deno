import { asString, isObject, argsToString } from "./util/helpers.ts";
import {
  LogLevels,
  getLevelByName,
  getLevelName,
  LevelName,
} from "./levels.ts";
import type { BaseHandler } from "./handlers.ts";
import { stripColor } from "./deps.ts";

export interface LogRecordOptions {
  msg: string;
  args: unknown[];
  level: number;
  loggerName: string;
  category?: string;
}

export class LogRecord {
  #args: unknown[];
  #datetime: Date;
  readonly msg: string;
  readonly level: number;
  readonly levelName: string;
  readonly loggerName: string;
  readonly category: string | null;

  constructor(options: LogRecordOptions) {
    this.msg = options.msg;
    this.#args = options.args;
    this.level = options.level;
    this.loggerName = options.loggerName;
    this.#datetime = new Date();
    this.levelName = getLevelName(options.level);
    this.category = options.category || null;
  }

  get clearMsg(): string {
    return stripColor(this.msg);
  }

  get args(): unknown[] {
    return [...this.#args];
  }
  get datetime(): Date {
    return new Date(this.#datetime.getTime());
  }
}

export interface LoggerOptions {
  handlers?: BaseHandler[];
  returnResult?: boolean;
}

export class Logger {
  #level: LogLevels;
  #handlers: BaseHandler[];
  #returnResult: boolean;
  readonly #loggerName: string;

  constructor(
    loggerName: string,
    levelName: LevelName,
    options: LoggerOptions = {},
  ) {
    this.#loggerName = loggerName;
    this.#level = getLevelByName(levelName);
    this.#handlers = options.handlers || [];
    this.#returnResult = options.returnResult ?? false;
  }

  get returnResult(): boolean {
    return this.#returnResult;
  }
  set returnResult(flag: boolean) {
    this.#returnResult = flag;
  }

  get level(): LogLevels {
    return this.#level;
  }
  set level(level: LogLevels) {
    this.#level = level;
  }

  get levelName(): LevelName {
    return getLevelName(this.#level);
  }
  set levelName(levelName: LevelName) {
    this.#level = getLevelByName(levelName);
  }

  get loggerName(): string {
    return this.#loggerName;
  }

  set handlers(hndls: BaseHandler[]) {
    this.#handlers = hndls;
  }
  get handlers(): BaseHandler[] {
    return this.#handlers;
  }

  /** If the level of the logger is greater than the level to log, then nothing
   * is logged, otherwise a log record is passed to each log handler.  `msg` data
   * passed in is returned.  If a function is passed in, it is only evaluated
   * if the msg will be logged and the return value will be the result of the
   * function, not the function itself, unless the function isn't called, in which
   * case undefined is returned.  All types are coerced to strings for logging.
   */
  private _log(
    level: number,
    ...args: unknown[]
  ): string | undefined {
    if (this.level > level) {
      return this.#returnResult ? stripColor(argsToString(args)) : undefined;
    }

    const record: LogRecord = new LogRecord({
      msg: argsToString(args),
      args,
      level: level,
      loggerName: this.loggerName,
    });

    this.#handlers.forEach((handler): void => {
      handler.handle(record);
    });

    if (this.#returnResult) {
      return record.clearMsg;
    }
  }

  private _logFormat(
    level: number,
    format: string,
    ...args: unknown[]
  ): string | undefined {
    if (this.level > level) {
      return this.returnResult
        ? stripColor(this.msgFormat(format, args))
        : undefined;
    }

    const record: LogRecord = new LogRecord({
      msg: this.msgFormat(format, args),
      args,
      level: level,
      loggerName: this.loggerName,
    });

    this.#handlers.forEach((handler): void => {
      handler.handle(record);
    });

    if (this.returnResult) {
      return record.clearMsg;
    }
  }

  msgFormat(format: string, args: unknown[]): string {
    if (!args.length) {
      return format;
    }

    const argsLength = args.length;
    const obj: Record<string, any> | null = isObject(args[0])
      ? args[0] as Record<string, any>
      : null;

    return format.replace(/{(\w+)}/g, (match, p1: string): string => {
      const p1Int = parseInt(p1);
      let value: any = null;

      if (isNaN(p1Int)) {
        if (obj) {
          value = obj[p1];
        }
      } else {
        if (p1Int <= argsLength) {
          value = args[p1Int];
        }
      }

      // do not interpolate missing values
      if (value == null) {
        return match;
      }

      return asString(value);
    });
  }

  debug(...args: unknown[]): string | undefined {
    return this._log(LogLevels.DEBUG, ...args);
  }

  debugFormat(format: string, ...args: unknown[]): string | undefined {
    return this._logFormat(LogLevels.DEBUG, format, ...args);
  }

  info(...args: unknown[]): string | undefined {
    return this._log(LogLevels.INFO, ...args);
  }

  infoFormat(format: string, ...args: unknown[]): string | undefined {
    return this._logFormat(LogLevels.INFO, format, ...args);
  }

  warning(...args: unknown[]): string | undefined {
    return this._log(LogLevels.WARNING, ...args);
  }

  warningFormat(format: string, ...args: unknown[]): string | undefined {
    return this._logFormat(LogLevels.WARNING, format, ...args);
  }

  error(...args: unknown[]): string | undefined {
    return this._log(LogLevels.ERROR, ...args);
  }

  errorFormat(format: string, ...args: unknown[]): string | undefined {
    return this._logFormat(LogLevels.ERROR, format, ...args);
  }

  critical(...args: unknown[]): string | undefined {
    return this._log(LogLevels.CRITICAL, ...args);
  }

  criticalFormat(format: string, ...args: unknown[]): string | undefined {
    return this._logFormat(LogLevels.CRITICAL, format, ...args);
  }
}

export class LoggerCategory {
  readonly #category: string;
  readonly #logger: Logger;

  constructor(category: string, logger: Logger) {
    this.#category = category;
    this.#logger = logger;
  }

  private _log(level: number, ...args: unknown[]): string | undefined {
    if (this.#logger.level > level) {
      return this.#logger.returnResult
        ? stripColor(argsToString(args))
        : undefined;
    }

    const record: LogRecord = new LogRecord({
      msg: argsToString(args),
      args,
      level: level,
      loggerName: this.#logger.loggerName,
      category: this.#category,
    });

    this.#logger.handlers.forEach((handler): void => {
      handler.handle(record);
    });

    if (this.#logger.returnResult) {
      return record.clearMsg;
    }
  }

  private _logFormat(
    level: number,
    format: string,
    ...args: unknown[]
  ): string | undefined {
    if (this.#logger.level > level) {
      return this.#logger.returnResult
        ? stripColor(this.#logger.msgFormat(format, args))
        : undefined;
    }

    const record: LogRecord = new LogRecord({
      msg: this.#logger.msgFormat(format, args),
      args: [],
      level: level,
      loggerName: this.#logger.loggerName,
      category: this.#category,
    });

    this.#logger.handlers.forEach((handler): void => {
      handler.handle(record);
    });

    if (this.#logger.returnResult) {
      return record.clearMsg;
    }
  }

  debug(...args: unknown[]): string | undefined {
    return this._log(LogLevels.DEBUG, ...args);
  }

  debugFormat(format: string, ...args: unknown[]): string | undefined {
    return this._logFormat(LogLevels.DEBUG, format, ...args);
  }

  info(...args: unknown[]): string | undefined {
    return this._log(LogLevels.INFO, ...args);
  }

  infoFormat(format: string, ...args: unknown[]): string | undefined {
    return this._logFormat(LogLevels.INFO, format, ...args);
  }

  warning(...args: unknown[]): string | undefined {
    return this._log(LogLevels.WARNING, ...args);
  }

  warningFormat(format: string, ...args: unknown[]): string | undefined {
    return this._logFormat(LogLevels.WARNING, format, ...args);
  }

  error(...args: unknown[]): string | undefined {
    return this._log(LogLevels.ERROR, ...args);
  }

  errorFormat(format: string, ...args: unknown[]): string | undefined {
    return this._logFormat(LogLevels.ERROR, format, ...args);
  }

  critical(...args: unknown[]): string | undefined {
    return this._log(LogLevels.CRITICAL, ...args);
  }

  criticalFormat(format: string, ...args: unknown[]): string | undefined {
    return this._logFormat(LogLevels.CRITICAL, format, ...args);
  }
}
