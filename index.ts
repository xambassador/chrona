import bytes from "bytes";
import chalk from "chalk";
import util from "util";

import type { Chalk } from "chalk";
import type { NextFunction, Request, Response } from "express";
/* ----------------------------------------------------------------------------------------------- */

type LoggerOptions =
  | {
      transporter?: (string: string, args: unknown[]) => void;
    }
  | ((string: string, args: unknown[]) => void);
type InterpolateReturnType = (
  isRequest: boolean,
  req: Request,
  res: Response,
  err: any,
) => string;
type RequestTokens = Record<string, (token: string) => InterpolateReturnType>;
type ResponseTokens = Record<string, (token: string) => InterpolateReturnType>;
type Options = {
  delimiter?: string;
  separator?: string;
};
type ParsedTokens = {
  [key: string]: {
    tokens: string[];
    isIncommingSet: boolean;
  };
};

const DEFAULT_FORMAT =
  ":incoming :method :url :status :response-time :content-length";
const colorCodes: Record<number, string> = {
  0: "yellow",
  1: "green",
  7: "magenta",
  2: "green",
  3: "cyan",
  4: "yellow",
  5: "red",
} as const;

const timeColorMap = {
  "<50ms": chalk.green,
  "<100ms": chalk.magenta,
  ">=100ms": chalk.red,
} as const;

const chalkColorsMap: Record<string, Chalk> = {
  magenta: chalk.magenta,
  red: chalk.red,
  yellow: chalk.yellow,
  cyan: chalk.cyan,
  green: chalk.green,
  blue: chalk.blue,
  white: chalk.white,
  gray: chalk.gray,
  grey: chalk.grey,
  magentaBright: chalk.magentaBright,
  redBright: chalk.redBright,
  greenBright: chalk.greenBright,
  yellowBright: chalk.yellowBright,
  blueBright: chalk.blueBright,
  cyanBright: chalk.cyanBright,
  whiteBright: chalk.whiteBright,
} as const;

const regexes = {
  // https://github.com/pbojinov/request-ip/blob/master/lib/is.js#L4
  ipv4: /^(?:(?:\d|[1-9]\d|1\d{2}|2[0-4]\d|25[0-5])\.){3}(?:\d|[1-9]\d|1\d{2}|2[0-4]\d|25[0-5])$/,
  // https://github.com/pbojinov/request-ip/blob/master/lib/is.js#L5
  ipv6: /^((?=.*::)(?!.*::.+::)(::)?([\dA-F]{1,4}:(:|\b)|){5}|([\dA-F]{1,4}:){6})((([\dA-F]{1,4}((?!\3)::|:\b|$))|(?!\2\3)){2}|(((2[0-4]|1\d|[1-9])?\d|25[0-5])\.?\b){4})$/i,
  number: /(\d)(?=(\d\d\d)+(?!\d))/g,
  time: /(\d+)(ms|s)/,
  token: /:\[([a-z\-_]+)\]/g,
  tokenWithoutBrackets: /\[|\]/g,
  tokenFormat: /(:\[[^\]]+\]|:[a-z\-_]+)/gi,
  date: /(?=(YYYY|YY|MM|DD|HH|mm|ss|ms))\1([:/]*)/g,
} as const;

/** @returns Current timestamp in human readable format. */
function timestamp() {
  const d = new Date();
  const dateString = d.toLocaleDateString();
  const timeString = d.toLocaleTimeString("en-US", { hour12: true });
  return `${dateString} ${timeString}`.trim().replace(/\s+/g, " ");
}

/** Convert number into human readable format. */
function humanize(n: string, o?: Options) {
  const options = o || {};
  const d = options.delimiter || ",";
  const s = options.separator || ".";
  const number = n.toString().split(".");
  number[0] = number[0].replace(regexes.number, `$1${d}`);
  return number.join(s);
}

/** Get color for time. */
function getColorForTime(t: number) {
  if (t < 50) return timeColorMap["<50ms"];
  if (t < 100) return timeColorMap["<100ms"];
  return timeColorMap[">=100ms"];
}

/** Get difference of two dates in human readable format. */
function time(start: number) {
  const delta = Date.now() - start;
  const t = humanize(
    delta < 10000 ? `${delta}ms` : `${Math.round(delta / 1000)}s`,
  );

  return {
    time: t,
    delta,
  };
}

/** Check if value is IP address. */
function ip(value: string | undefined) {
  if (!value) return false;
  return regexes.ipv4.test(value) || regexes.ipv6.test(value);
}

/** Get forwarded for value from header. */
function getForwardedFor(value: string) {
  if (!value) return "-";

  const forwardedIps = value.split(",").map((v) => {
    const currentIp = v.trim();
    if (currentIp.includes(":")) {
      const splitted = currentIp.split(":");
      if (splitted.length === 2) return splitted[0];
    }
    return currentIp;
  });

  for (let i = 0; i < forwardedIps.length; i++) {
    // ignore empty segments and unknown IPs
    if (ip(forwardedIps[i])) return forwardedIps[i];
  }

  return "-";
}

/** Get IP address from request. */
function getIp(req: Request) {
  if (!req.headers) return "-";
  if (ip(req.headers["x-client-ip"] as string)) {
    return req.headers["x-client-ip"] as string;
  }

  const forwardedFor = getForwardedFor(
    req.headers["x-forwarded-for"] as string,
  );
  if (forwardedFor !== "-") return forwardedFor;

  if (ip(req.headers["x-real-ip"] as string)) {
    return req.headers["x-real-ip"] as string;
  }

  if (ip(req.headers["x-forwarded"] as string)) {
    return req.headers["x-forwarded"] as string;
  }

  if (ip(req.headers["forwarded-for"] as string)) {
    return req.headers["forwarded-for"] as string;
  }

  if (req.socket && ip(req.socket.remoteAddress)) {
    return req.socket.remoteAddress;
  }

  // since connection is marked as deprecated, it is used here as a fallback
  // Since v16.0.0
  if (req.connection) {
    if (ip(req.connection.remoteAddress)) {
      return req.connection.remoteAddress;
    }
  }

  return "-";
}

/** Pre-defined tokens. */
const TOKENS = [
  ":incoming",
  ":remote-address",
  ":date",
  ":method",
  ":url",
  ":http-version",
  ":status",
  ":content-length",
  ":response-time",
  ":referrer",
  ":user-agent",
] as const;

type Token = (typeof TOKENS)[number];

/** Get chalk color function for provided color. */
function colorizedFn(color: string | chalk.Chalk) {
  let colorized = chalk.gray;

  if (typeof color === "function") {
    colorized = color;
  } else {
    colorized = chalkColorsMap[color] || chalk.gray;
  }

  return colorized;
}

/** Get values for provided tokens for incoming request at runtime. */
const REQUEST: Record<string, (req: Request) => string> = {
  ":method": (req) => req.method,
  ":url": (req) => req.originalUrl || req.url,
  ":date": () => timestamp(),
  ":remote-address": (req) => getIp(req) as string,
  ":referrer": (req) =>
    (req.headers.referer || req.headers.referrer || "-") as string,
  ":user-agent": (req) => req.headers["user-agent"] || "-",
  ":http-version": (req) =>
    "HTTP/" + req.httpVersionMajor + "." + req.httpVersionMinor,
} as const;

/** Get value for provided token from outgoing response at runtime. */
const RESPONSE: Record<
  string,
  (
    req: Request,
    res: Response,
    err: any,
  ) => string | { value: string; colorized: chalk.Chalk }
> = {
  ":date": () => timestamp(),
  ":status": (_, res, err) => {
    const status = err ? (err as any).status || 500 : res.statusCode || 404;
    const s = (status / 100) | 0;
    // eslint-disable-next-line no-prototype-builtins
    const color = colorCodes.hasOwnProperty(s) ? colorCodes[s] : colorCodes[0];
    return {
      value: status as string,
      colorized: chalkColorsMap[color],
    };
  },
  ":content-length": (_, res, err) => {
    const status = err ? (err as any).status || 500 : res.statusCode || 404;
    const contentLength = res.getHeader("content-length")
      ? parseInt(res.getHeader("content-length") as string, 10)
      : null;

    let length: string;

    /**
     * 204: no content, 205: reset content, 304: not modified Typically these
     * status codes should result in no response body.
     */
    if ([204, 205, 304].includes(status)) {
      length = "";
    } else if (contentLength == null) {
      length = "-";
    } else {
      length = bytes(contentLength).toLowerCase();
    }

    return length;
  },
  ":response-time": (_, res) => {
    const start = res.getHeader("x-start-time") as string;
    const { time: t, delta } = time(Number(start));
    return {
      value: t,
      colorized: getColorForTime(delta),
    };
  },
  ":method": (req) => req.method,
  ":url": (req) => req.originalUrl || req.url,
} as const;

/** Pre compile format string. */
function interpolate(token: string, color: string | chalk.Chalk) {
  const isContainsBrackets = token.match(regexes.tokenWithoutBrackets);
  const t = token.replace(regexes.tokenWithoutBrackets, "");

  return (isRequest: boolean, req: Request, res: Response, err: any) => {
    if (isRequest) {
      const result = REQUEST[t](req);
      return isContainsBrackets
        ? colorizedFn(color)(`[${result}]`)
        : colorizedFn(color)(`${result}`);
    }

    const result = RESPONSE[t](req, res, err);
    if (typeof result === "object") {
      const { value, colorized } = result;
      return isContainsBrackets
        ? colorized(`[${value}]`)
        : colorized(`${value}`);
    }

    return isContainsBrackets
      ? colorizedFn(color)(`[${result}]`)
      : colorizedFn(color)(`${result}`);
  };
}

/**
 * Accepted tokens for incoming request and their corresponding compiled format
 * functions.
 */
const REQUEST_TOKENS: RequestTokens = {
  ":method": (token) => interpolate(token, "whiteBright"),
  ":url": (token) => interpolate(token, "magenta"),
  ":date": (token) => interpolate(token, "gray"),
  ":remote-address": (token) => interpolate(token, "gray"),
  ":referrer": (token) => interpolate(token, "gray"),
  ":user-agent": (token) => interpolate(token, "gray"),
  ":http-version": (token) => interpolate(token, "gray"),
};

/**
 * Accepted tokens for outgoing response and their corresponding compiled format
 * functions.
 */
const RESPONSE_TOKENS: ResponseTokens = {
  ":date": (token) => interpolate(token, "gray"),
  ":status": (token) => interpolate(token, ""),
  ":content-length": (token) => interpolate(token, "gray"),
  ":response-time": (token) => interpolate(token, "gray"),
  ":method": (token) => interpolate(token, "whiteBright"),
  ":url": (token) => interpolate(token, "magenta"),
};

const parsedTokens: ParsedTokens = {};

/** Extract tokens from format string. */
function extractTokens(format: string) {
  if (parsedTokens[format]) return parsedTokens[format];

  let isIncommingSet = false;
  const tokens = format
    .split(regexes.tokenFormat)
    .filter((token) => token.trim() !== "")
    .map((token) => token.replace(/\s/g, ""))
    .filter((token) => {
      const tokenWithoutBrackets = token.replace(
        regexes.tokenWithoutBrackets,
        "",
      );
      if (tokenWithoutBrackets === ":incoming") isIncommingSet = true;
      return TOKENS.includes(tokenWithoutBrackets as Token);
    });

  parsedTokens[format] = {
    tokens,
    isIncommingSet,
  };

  return parsedTokens[format];
}

/** Compile format string. */
function compile(format: string) {
  const { isIncommingSet, tokens } = extractTokens(format);

  let whereTheResponseIndicatorIs = -999;
  const requestOutput = isIncommingSet ? [chalk.gray(" INCOMING ")] : [];
  const responseOutput = isIncommingSet ? [chalk.gray(" OUTGOING ")] : [];

  if (!isIncommingSet) {
    requestOutput.push(chalk.gray("<--"));
    responseOutput.push("-->");
    whereTheResponseIndicatorIs = responseOutput.length - 1;
  }

  const requstArgs: InterpolateReturnType[] = [];
  const responseArgs: InterpolateReturnType[] = [];

  tokens.forEach((token) => {
    const value = token.replace(regexes.tokenWithoutBrackets, "");
    if (value === ":incoming") {
      requestOutput.push(chalk.gray("<--"));
      responseOutput.push("-->");
      whereTheResponseIndicatorIs = responseOutput.length - 1;
      return;
    }

    if (value === ":date") {
      requestOutput.push("%s");
      requstArgs.push(REQUEST_TOKENS[value](token));
      responseOutput.push("%s");
      responseArgs.push(RESPONSE_TOKENS[value](token));
      return;
    }

    if (REQUEST_TOKENS[value]) {
      requestOutput.push("%s");
      requstArgs.push(REQUEST_TOKENS[value](token));
    }

    if (RESPONSE_TOKENS[value]) {
      responseOutput.push("%s");
      responseArgs.push(RESPONSE_TOKENS[value](token));
    }
  });

  const logRequest = (
    request: Request,
    response: Response,
    error: any,
    print: (...args: unknown[]) => void,
  ) => {
    const results = requstArgs.map((fn) => fn(true, request, response, error));
    requestOutput.unshift(
      chalk.bgBlue.bold(` ${request.protocol.toUpperCase()} `),
    );
    const string = util.format(requestOutput.join(" "), ...results);
    print(string);
  };

  const logResponse = (
    request: Request,
    response: Response,
    error: any,
    event: string,
    print: (...args: unknown[]) => void,
  ) => {
    const results = responseArgs.map((fn) =>
      fn(false, request, response, error),
    );

    if (whereTheResponseIndicatorIs !== -999) {
      let upstream: string;
      if (error) {
        upstream = chalk.red("xxx");
      } else if (event === "close") {
        upstream = chalk.yellow("-x-");
      } else if (response.statusCode >= 500) {
        upstream = chalk.red("xxx");
      } else if (response.statusCode === 404) {
        upstream = chalk.cyan("-X-");
      } else {
        upstream = chalk.gray("-->");
      }

      responseOutput[whereTheResponseIndicatorIs] = upstream;
    }

    responseOutput.unshift(
      chalk.bgBlue.bold(` ${request.protocol.toUpperCase()} `),
    );
    const string = util.format(responseOutput.join(" "), ...results);
    print(string);
  };

  return { logRequest, logResponse };
}

/**
 * Transporter function. If no transporter is provided, it will default to
 * `console.log`.
 */
function transporter(options?: LoggerOptions) {
  let transport: (string: string, args: unknown[]) => void | undefined;
  if (typeof options === "function") transport = options;
  else if (options?.transporter) transport = options.transporter;

  return (...args: unknown[]) => {
    const string = util.format(...args);
    if (transport) transport(string, args);
    else console.log(...args);
  };
}

/** Logger middleware. */
const logger = (format?: string | null, options?: LoggerOptions) => {
  const print = transporter(options);
  const { logRequest, logResponse } = compile(format || DEFAULT_FORMAT);

  return (request: Request, response: Response, next: NextFunction) => {
    const start = Date.now();
    response.setHeader("x-start-time", start);

    logRequest(request, response, null, print);

    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const onfinish = done.bind(null, "finish");
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const onclose = done.bind(null, "close");

    response.once("finish", onfinish);
    response.once("close", onclose);

    function done(event: string) {
      response.removeListener("finish", onfinish);
      response.removeListener("close", onclose);
      logResponse(request, response, null, event, print);
    }

    next();
  };
};

export = logger;
