import { BaseHandler, HandlerOptions } from "../handlers.ts";
import { LevelName } from "../levels.ts";
import type { LogRecord } from "../logger.ts";

export interface TelegramHandlerOptions extends HandlerOptions {
  botToken: string;
  chatID: string;
  projectName?: string;
}

export class TelegramHandler extends BaseHandler {
  #botToken: string;
  #chatID: string;
  #projectName: string | null;
  #hasConnectToTg: boolean = false;
  #queue: string[];
  #isRunQueue: boolean = false;

  constructor(levelName: LevelName, options: TelegramHandlerOptions) {
    super(levelName, options);

    this.#queue = [];
    this.#botToken = options.botToken;
    this.#chatID = options.chatID;
    this.#projectName = options.projectName || null;
  }

  async setup(): Promise<void> {
    if (!this.#botToken) {
      throw new Error("botToken is required");
    }

    if (!this.#chatID) {
      throw new Error("chatID is required");
    }

    fetch(this._getTgLink("getMe"), { keepalive: true }).then((tgRes) => {
      if (tgRes.status !== 200) {
        throw new Error("botToken is invalid");
      }

      this.#hasConnectToTg = true;
      setTimeout(() => this.tapQueue(), 100);
    }).catch((err) => {
      console.error(err);
    });
  }

  format(logRecord: LogRecord): string {
    let msg = super.format(logRecord);
    msg = `<pre>${msg}</pre>`;

    if (this.#projectName) {
      msg = `${this.#projectName}\n${msg}`;
    }

    return msg;
  }

  log(msg: string): void {
    this.#queue.push(msg);

    if (this.#hasConnectToTg) {
      setTimeout(() => this.tapQueue(), 100);
    }
  }

  tapQueue(): void {
    if (this.#isRunQueue || !this.#queue.length || !this.#hasConnectToTg) {
      return;
    }

    const msg = this.#queue.shift();
    if (!msg) {
      setTimeout(() => this.tapQueue(), 100);
      return;
    }

    this.#isRunQueue = true;
    const fm = new FormData();
    fm.set("chat_id", this.#chatID);
    fm.set("text", msg);
    fm.set("parse_mode", "HTML");

    fetch(this._getTgLink("sendMessage"), {
      method: "POST",
      body: fm,
      keepalive: true,
    }).catch((err) => {
      console.error(err);
    }).finally(() => {
      this.#isRunQueue = false;
      setTimeout(() => this.tapQueue(), 100);
    });
  }

  private _getTgLink(method: string) {
    return `https://api.telegram.org/bot${this.#botToken}/${method}`;
  }
}
