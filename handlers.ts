// Copyright 2018-2020 the Deno authors. All rights reserved. MIT license.
import { getLevelByName, LevelName, LogLevels } from "./levels.ts";
import type { LogRecord } from "./logger.ts";
import {
  red,
  yellow,
  blue,
  bold,
  stripColor,
  existsSync,
  exists,
  BufWriterSync,
  asString,
  ABSOLUTETIME_FORMAT,
} from "./deps.ts";

const DEFAULT_FORMATTER = "{levelName} {msg}";
type FormatterFunction = (logRecord: LogRecord) => string;
type LogMode = "a" | "w" | "x";

export interface HandlerOptions {
  formatter?: string | FormatterFunction;
  datetimeFormat?: string;
  noColor?: boolean;
}

interface IFormatResult {
  prefix?: string;
  msg: string;
}

interface ISplitFormatter {
  prefix: string | null;
  msg: string | null;
}

export class BaseHandler {
  level: number;
  levelName: LevelName;
  formatter: string | FormatterFunction;
  datetimeFormat: string;
  noColor: boolean = true;

  constructor(levelName: LevelName, options: HandlerOptions = {}) {
    this.level = getLevelByName(levelName);
    this.levelName = levelName;

    this.formatter = options.formatter || DEFAULT_FORMATTER;
    this.datetimeFormat = options.datetimeFormat || ABSOLUTETIME_FORMAT;

    if (options.noColor !== undefined) {
      this.noColor = options.noColor;
    }
  }

  handle(logRecord: LogRecord): void {
    if (this.level > logRecord.level) return;

    const msg = this.format(logRecord);
    return this.log(this.noColor ? stripColor(msg) : msg);
  }

  formatAndPrefix(logRecord: LogRecord): IFormatResult {
    if (this.formatter instanceof Function) {
      return { msg: this.formatter(logRecord) };
    }

    const result: IFormatResult = {
      msg: "",
    };
    const splitFormatter = this.splitFormatter(this.formatter);

    if (splitFormatter.msg) {
      result.msg = this.formatCustom(splitFormatter.msg, logRecord);
    }

    if (splitFormatter.prefix) {
      result.prefix = this.formatCustom(splitFormatter.prefix, logRecord);
    }

    return result;
  }

  formatCustom(format: string, logRecord: LogRecord): string {
    return format.replace(/{(\w+)}/g, (match, p1): string => {
      let value: string | number | unknown[] | Date | null = null;

      if (p1 === "datetime") {
        value = asString(this.datetimeFormat, logRecord.datetime);
      } else {
        value = logRecord[p1 as keyof LogRecord];
      }

      // do not interpolate missing values
      if (value == null) {
        return match;
      }

      return String(value);
    });
  }

  splitFormatter(formatter: string): ISplitFormatter {
    const mathces = /(.*)({msg}.*)/g.exec(formatter);

    return {
      prefix: mathces && mathces.length > 1 ? mathces[1] : null,
      msg: mathces && mathces.length > 2 ? mathces[2] : null,
    };
  }

  format(logRecord: LogRecord): string {
    if (this.formatter instanceof Function) {
      return this.formatter(logRecord);
    }

    return this.formatCustom(this.formatter, logRecord);
  }

  log(_msg: string): void {}
  async setup(): Promise<void> {}
  async destroy(): Promise<void> {}
}

export class ConsoleHandler extends BaseHandler {
  constructor(levelName: LevelName, options: HandlerOptions = {}) {
    if (!options.noColor) {
      options.noColor = false;
    }

    super(levelName, options);
  }

  format(logRecord: LogRecord): string {
    if (this.noColor) {
      return super.format(logRecord);
    }

    const formatAndPrefix = this.formatAndPrefix(logRecord);
    let msg = "";

    switch (logRecord.level) {
      case LogLevels.INFO:
        msg = (formatAndPrefix.prefix ? blue(formatAndPrefix.prefix) : "") +
          formatAndPrefix.msg;
        break;
      case LogLevels.WARNING:
        msg = (formatAndPrefix.prefix ? yellow(formatAndPrefix.prefix) : "") +
          formatAndPrefix.msg;
        break;
      case LogLevels.ERROR:
        msg = red(formatAndPrefix.prefix + formatAndPrefix.msg);
        break;
      case LogLevels.CRITICAL:
        msg = bold(red(formatAndPrefix.prefix + formatAndPrefix.msg));
        break;
      default:
        break;
    }

    return msg;
  }

  log(msg: string): void {
    console.log(msg);
  }
}

export abstract class WriterHandler extends BaseHandler {
  protected _writer!: Deno.Writer;
  #encoder = new TextEncoder();

  abstract log(msg: string): void;
}

interface FileHandlerOptions extends HandlerOptions {
  filename: string;
  mode?: LogMode;
}

export class FileHandler extends WriterHandler {
  protected _file: Deno.File | undefined;
  protected _buf!: BufWriterSync;
  protected _filename: string;
  protected _mode: LogMode;
  protected _openOptions: Deno.OpenOptions;
  protected _encoder = new TextEncoder();
  #unloadCallback = (): Promise<void> => this.destroy();

  constructor(levelName: LevelName, options: FileHandlerOptions) {
    super(levelName, options);
    this._filename = options.filename;
    // default to append mode, write only
    this._mode = options.mode ? options.mode : "a";
    this._openOptions = {
      createNew: this._mode === "x",
      create: this._mode !== "x",
      append: this._mode === "a",
      truncate: this._mode !== "a",
      write: true,
    };
  }

  async setup(): Promise<void> {
    this._file = await Deno.open(this._filename, this._openOptions);
    this._writer = this._file;
    this._buf = new BufWriterSync(this._file);

    addEventListener("unload", this.#unloadCallback);
  }

  handle(logRecord: LogRecord): void {
    super.handle(logRecord);

    // Immediately flush if log level is higher than ERROR
    if (logRecord.level > LogLevels.ERROR) {
      this.flush();
    }
  }

  log(msg: string): void {
    this._buf.writeSync(this._encoder.encode(msg + "\n"));
  }

  flush(): void {
    if (this._buf?.buffered() > 0) {
      this._buf.flush();
    }
  }

  destroy(): Promise<void> {
    this.flush();
    this._file?.close();
    this._file = undefined;
    removeEventListener("unload", this.#unloadCallback);
    return Promise.resolve();
  }
}

interface RotatingFileHandlerOptions extends FileHandlerOptions {
  maxBytes: number;
  maxBackupCount: number;
}

export class RotatingFileHandler extends FileHandler {
  #maxBytes: number;
  #maxBackupCount: number;
  #currentFileSize = 0;

  constructor(levelName: LevelName, options: RotatingFileHandlerOptions) {
    super(levelName, options);
    this.#maxBytes = options.maxBytes;
    this.#maxBackupCount = options.maxBackupCount;
  }

  async setup(): Promise<void> {
    if (this.#maxBytes < 1) {
      this.destroy();
      throw new Error("maxBytes cannot be less than 1");
    }
    if (this.#maxBackupCount < 1) {
      this.destroy();
      throw new Error("maxBackupCount cannot be less than 1");
    }
    await super.setup();

    if (this._mode === "w") {
      // Remove old backups too as it doesn't make sense to start with a clean
      // log file, but old backups
      for (let i = 1; i <= this.#maxBackupCount; i++) {
        if (await exists(this._filename + "." + i)) {
          await Deno.remove(this._filename + "." + i);
        }
      }
    } else if (this._mode === "x") {
      // Throw if any backups also exist
      for (let i = 1; i <= this.#maxBackupCount; i++) {
        if (await exists(this._filename + "." + i)) {
          this.destroy();
          throw new Deno.errors.AlreadyExists(
            "Backup log file " + this._filename + "." + i + " already exists",
          );
        }
      }
    } else {
      this.#currentFileSize = (await Deno.stat(this._filename)).size;
    }
  }

  log(msg: string): void {
    const msgByteLength = this._encoder.encode(msg).byteLength + 1;

    if (this.#currentFileSize + msgByteLength > this.#maxBytes) {
      this.rotateLogFiles();
      this.#currentFileSize = 0;
    }

    this._buf.writeSync(this._encoder.encode(msg + "\n"));
    this.#currentFileSize += msgByteLength;
  }

  rotateLogFiles(): void {
    this._buf.flush();
    Deno.close(this._file!.rid);

    for (let i = this.#maxBackupCount - 1; i >= 0; i--) {
      const source = this._filename + (i === 0 ? "" : "." + i);
      const dest = this._filename + "." + (i + 1);

      if (existsSync(source)) {
        Deno.renameSync(source, dest);
      }
    }

    this._file = Deno.openSync(this._filename, this._openOptions);
    this._writer = this._file;
    this._buf = new BufWriterSync(this._file);
  }
}
