// Copyright 2018-2020 the Deno authors. All rights reserved. MIT license.
import { assertEquals, assert } from "./test_deps.ts";
import { LogRecord, Logger } from "./logger.ts";
import { LogLevels, LevelName } from "./levels.ts";
import { BaseHandler } from "./handlers.ts";

class TestHandler extends BaseHandler {
  public messages: string[] = [];
  public records: LogRecord[] = [];

  handle(record: LogRecord): void {
    this.records.push(record);
    super.handle(record);
  }

  public log(str: string): void {
    this.messages.push(str);
  }
}

Deno.test({
  name: "Logger names can be output in logs",
  fn() {
    const handlerNoName = new TestHandler("DEBUG");
    const handlerWithLoggerName = new TestHandler("DEBUG", {
      formatter: "[{loggerName}] {levelName} {msg}",
    });

    const logger = new Logger("config", "DEBUG", {
      handlers: [handlerNoName, handlerWithLoggerName],
    });
    logger.debug("hello");
    assertEquals(handlerNoName.messages[0], "DEBUG hello");
    assertEquals(handlerWithLoggerName.messages[0], "[config] DEBUG hello");
  },
});

Deno.test("simpleLogger", function (): void {
  const handler = new TestHandler("DEBUG");
  let logger = new Logger("default", "DEBUG");

  assertEquals(logger.level, LogLevels.DEBUG);
  assertEquals(logger.levelName, "DEBUG");
  assertEquals(logger.handlers, []);

  logger = new Logger("default", "DEBUG", { handlers: [handler] });

  assertEquals(logger.handlers, [handler]);
});

Deno.test("customHandler", function (): void {
  const handler = new TestHandler("DEBUG");
  const logger = new Logger(
    "default",
    "DEBUG",
    { handlers: [handler], returnResult: true },
  );

  const inlineData: string | undefined = logger.debug("foo", 1, 2);

  const record = handler.records[0];
  assertEquals(record.clearMsg, "foo 1 2");
  assertEquals(record.args, ["foo", 1, 2]);
  assertEquals(record.level, LogLevels.DEBUG);
  assertEquals(record.levelName, "DEBUG");

  assertEquals(handler.messages, ["DEBUG foo 1 2"]);
  assertEquals(inlineData!, "foo 1 2");
});

Deno.test("logFunctions", function (): void {
  const doLog = (level: LevelName): TestHandler => {
    const handler = new TestHandler(level);
    const logger = new Logger(
      "default",
      level,
      { handlers: [handler], returnResult: true },
    );

    console.dir(
      {
        level: level,
        levelName: logger.levelName,
      },
    );

    const debugData = logger.debug("foo");

    const infoData = logger.info("bar");
    const warningData = logger.warning("baz");
    const errorData = logger.error("boo");
    const criticalData = logger.critical("doo");
    assertEquals(debugData, "foo");
    assertEquals(infoData, "bar");
    assertEquals(warningData, "baz");
    assertEquals(errorData, "boo");
    assertEquals(criticalData, "doo");
    return handler;
  };

  let handler: TestHandler;
  handler = doLog("DEBUG");

  assertEquals(handler.messages, [
    "DEBUG foo",
    "INFO bar",
    "WARNING baz",
    "ERROR boo",
    "CRITICAL doo",
  ]);

  handler = doLog("INFO");

  assertEquals(handler.messages, [
    "INFO bar",
    "WARNING baz",
    "ERROR boo",
    "CRITICAL doo",
  ]);

  handler = doLog("WARNING");

  assertEquals(handler.messages, ["WARNING baz", "ERROR boo", "CRITICAL doo"]);

  handler = doLog("ERROR");

  assertEquals(handler.messages, ["ERROR boo", "CRITICAL doo"]);

  handler = doLog("CRITICAL");

  assertEquals(handler.messages, ["CRITICAL doo"]);
});

Deno.test(
  "String resolver fn will not execute if msg will not be logged",
  function (): void {
    const handler = new TestHandler("ERROR");
    const logger = new Logger("default", "ERROR", { handlers: [handler] });
    let called = false;

    const expensiveFunction = (): string => {
      called = true;
      return "expensive function result";
    };

    const inlineData: string | undefined = logger.debug(
      expensiveFunction,
      1,
      2,
    );
    assert(!called);
    assertEquals(inlineData, undefined);
  },
);
