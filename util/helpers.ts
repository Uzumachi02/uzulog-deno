export function asString(data: unknown): string {
  return typeof data === "string" ? data : Deno.inspect(data);
}

export function isObject(o: unknown): boolean {
  return o instanceof Object && o.constructor === Object;
}

export function argsToString(args: unknown[]) {
  let result = "";

  if (args.length > 0) {
    if (args.length === 1) {
      result += asString(args[0]);
    } else {
      for (const ars of args) {
        result += asString(ars) + " ";
      }
    }
  }

  return result.trim();
}
