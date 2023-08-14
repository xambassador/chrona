import bytes from "bytes";
import chalk from "chalk";
import util from "util";

import type { Chalk } from "chalk";
import type { NextFunction, Request, Response } from "express";
/* ----------------------------------------------------------------------------------------------- */

/* -----------------------------------------------------------------------------------------------
 * Type definitions
 * -----------------------------------------------------------------------------------------------*/
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
    flagIncomingSet: boolean;
  };
};

/* -----------------------------------------------------------------------------------------------
 * Globals
 * -----------------------------------------------------------------------------------------------*/
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
};

const timeColorMap = {
  "<50ms": chalk.green,
  "<100ms": chalk.magenta,
  ">=100ms": chalk.red,
};

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
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const regexes = {
  ipv4: /^(?:(?:\d|[1-9]\d|1\d{2}|2[0-4]\d|25[0-5])\.){3}(?:\d|[1-9]\d|1\d{2}|2[0-4]\d|25[0-5])$/,
  ipv6: /^((?=.*::)(?!.*::.+::)(::)?([\dA-F]{1,4}:(:|\b)|){5}|([\dA-F]{1,4}:){6})((([\dA-F]{1,4}((?!\3)::|:\b|$))|(?!\2\3)){2}|(((2[0-4]|1\d|[1-9])?\d|25[0-5])\.?\b){4})$/i,
  number: /(\d)(?=(\d\d\d)+(?!\d))/g,
  time: /(\d+)(ms|s)/,
  token: /:\[([a-z\-_]+)\]/g,
  tokenWithourBrackets: /\[|\]/g,
  tokenFormat: /(:\[[^\]]+\]|:[a-z\-_]+)/gi,
};

/**
 * Convert number into human readable format.
 *
 * @param n {string} Number need to convert in human readable
 * @param o {Options} Options
 * @returns {string} Human readable string
 */
function humanize(n: string, o?: Options) {
  const options = o || {};
  const d = options.delimiter || ",";
  const s = options.separator || ".";
  const number = n.toString().split(".");
  number[0] = number[0].replace(regexes.number, `$1${d}`);
  return number.join(s);
}

/**
 * Get color for time.
 *
 * @param t {string} Time
 * @returns {Chalk} Chalk instance
 */
function getColorForTime(t: string) {
  const match = t.match(regexes.time);

  if (match) {
    const value = parseInt(match[1], 10);
    const unit = match[2];

    const milliseconds = unit === "ms" ? value : value * 1000;

    if (milliseconds < 50) return timeColorMap["<50ms"];
    if (milliseconds < 100) return timeColorMap["<100ms"];
    return timeColorMap[">=100ms"];
  }

  return chalk.gray;
}

/**
 * Get difference of two dates in human readable format.
 *
 * @param start {number} Start time
 * @returns {string} Human readable string
 */
function time(start: number) {
  const delta = Date.now() - start;
  const t = humanize(
    delta < 10000 ? `${delta}ms` : `${Math.round(delta / 1000)}s`,
  );

  return t;
}

/**
 * Check if value is IP address.
 *
 * @param value {string | undefined} Value to check
 * @returns {boolean} True if value is IP address
 */
function ip(value: string | undefined) {
  if (!value) return false;
  return regexes.ipv4.test(value) || regexes.ipv6.test(value);
}

/**
 * Get forwarded for value from header.
 *
 * @param value {string} Header value
 * @returns {string} Forwarded for value
 */
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

/**
 * Get IP address from request.
 *
 * @param req {Request} Request
 * @returns {string | undefined} IP address
 */
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

/**
 * Pad number with zero.
 *
 * @param num {number}
 * @returns {string}
 */
function pad2(num: number) {
  const str = String(num);
  return (str.length === 1 ? "0" : "") + str;
}

/**
 * Get date in Apache common log format.
 *
 * @param dateTime {Date}
 * @returns {string}
 */
function date(dateTime: Date) {
  const currentDate = dateTime.getUTCDate();
  const hour = dateTime.getUTCHours();
  const mins = dateTime.getUTCMinutes();
  const secs = dateTime.getUTCSeconds();
  const year = dateTime.getUTCFullYear();
  const month = MONTHS[dateTime.getUTCMonth()];

  return (
    pad2(currentDate) +
    "/" +
    month +
    "/" +
    year +
    ":" +
    pad2(hour) +
    ":" +
    pad2(mins) +
    ":" +
    pad2(secs) +
    " +0000"
  );
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
];

/**
 * Get chalk color function for provided color.
 *
 * @param color {string | chalk.Chalk} Color
 * @returns {chalk.Chalk} Chalk instance
 */
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
  ":date": () => date(new Date()),
  ":remote-address": (req) => getIp(req) as string,
  ":referrer": (req) =>
    (req.headers.referer || req.headers.referrer || "-") as string,
  ":user-agent": (req) => req.headers["user-agent"] || "-",
  ":http-version": (req) =>
    "HTTP/" + req.httpVersionMajor + "." + req.httpVersionMinor,
};

/** Get value for provided token form outgoing response at runtime. */
const RESPONSE: Record<
  string,
  (
    req: Request,
    res: Response,
    err: any,
  ) => string | { value: string; colorized: chalk.Chalk }
> = {
  ":date": () => date(new Date()),
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
    const t = time(Number(start));
    return {
      value: t,
      colorized: getColorForTime(t),
    };
  },
  ":method": (req) => req.method,
  ":url": (req) => req.originalUrl || req.url,
};

/**
 * Pre compile format string.
 *
 * @param token {string}
 * @param color {string | chalk.Chalk}
 * @returns {function}
 */
function interpolate(token: string, color: string | chalk.Chalk) {
  if (token.match(regexes.token)) {
    const t = token.replace(regexes.tokenWithourBrackets, "");
    return (isRequest: boolean, req: Request, res: Response, err: any) => {
      if (isRequest) {
        const v = REQUEST[t](req);
        return colorizedFn(color)(`[${v}]`);
      }

      const v = RESPONSE[t](req, res, err);
      if (typeof v === "object") {
        const { value, colorized } = v;
        return colorized(`[${value}]`);
      }

      return colorizedFn(color)(`[${v}]`);
    };
  }

  return (isRequest: boolean, req: Request, res: Response, err: any) => {
    if (isRequest) {
      const v = REQUEST[token](req);
      return colorizedFn(color)(`${v}`);
    }

    const v = RESPONSE[token](req, res, err);
    if (typeof v === "object") {
      const { value, colorized } = v;
      return colorized(`${value}`);
    }

    return colorizedFn(color)(`${v}`);
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

/**
 * Extract tokens from format string.
 *
 * @param format {string}
 * @returns {ParsedTokens}
 */
function extractTokens(format: string) {
  if (parsedTokens[format]) return parsedTokens[format];

  let flagIncomingSet = false;
  const tokens = format
    .split(regexes.tokenFormat)
    .filter((token) => token.trim() !== "")
    .map((token) => token.replace(/\s/g, ""))
    .filter((token) => {
      const tokenWithoutBrackets = token.replace(
        regexes.tokenWithourBrackets,
        "",
      );
      if (tokenWithoutBrackets === ":incoming") flagIncomingSet = true;
      return TOKENS.includes(tokenWithoutBrackets);
    });

  parsedTokens[format] = {
    tokens,
    flagIncomingSet,
  };

  return parsedTokens[format];
}

/**
 * Compile format string.
 *
 * @param format {string} format string
 * @returns {function} Compiled format functions
 */
function compile(format: string) {
  const { flagIncomingSet, tokens } = extractTokens(format);

  const requestOutput = flagIncomingSet ? [chalk.gray("[INCOMING]")] : [];
  const responseOutput = flagIncomingSet ? [chalk.gray("[OUTGOING]")] : [];

  const requstArgs: InterpolateReturnType[] = [];
  const responseArgs: InterpolateReturnType[] = [];
  let i = -999;

  tokens.forEach((token) => {
    const value = token.replace(regexes.tokenWithourBrackets, "");
    if (value === ":incoming") {
      requestOutput.push(chalk.gray("<--"));
      responseOutput.push("-->");
      i = responseOutput.length - 1;
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
    const compiledArgs = requstArgs.map((fn) =>
      fn(true, request, response, error),
    );
    const string = util.format(requestOutput.join(" "), ...compiledArgs);
    print(string);
  };

  const logResponse = (
    request: Request,
    response: Response,
    error: any,
    event: string,
    print: (...args: unknown[]) => void,
  ) => {
    const compiledArgs = responseArgs.map((fn) =>
      fn(false, request, response, error),
    );

    if (i !== -999) {
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

      responseOutput[i] = upstream;
    }

    const string = util.format(responseOutput.join(" "), ...compiledArgs);
    print(string);
  };

  return { logRequest, logResponse };
}

/**
 * Transporter function. If no transporter is provided, it will default to
 * `console.log`.
 *
 * @param options {LoggerOptions}
 * @returns {Function} Transporter function
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

/**
 * Logger middleware.
 *
 * @param options {LoggerOptions}
 * @param format {string}
 * @returns {Function} Middleware function
 */
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

module.exports = logger;
