"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bytes_1 = __importDefault(require("bytes"));
const chalk_1 = __importDefault(require("chalk"));
const util_1 = __importDefault(require("util"));
const DEFAULT_FORMAT = ":incoming :method :url :status :response-time :content-length";
const colorCodes = {
    0: "yellow",
    1: "green",
    7: "magenta",
    2: "green",
    3: "cyan",
    4: "yellow",
    5: "red",
};
const timeColorMap = {
    "<50ms": chalk_1.default.green,
    "<100ms": chalk_1.default.magenta,
    ">=100ms": chalk_1.default.red,
};
const chalkColorsMap = {
    magenta: chalk_1.default.magenta,
    red: chalk_1.default.red,
    yellow: chalk_1.default.yellow,
    cyan: chalk_1.default.cyan,
    green: chalk_1.default.green,
    blue: chalk_1.default.blue,
    white: chalk_1.default.white,
    gray: chalk_1.default.gray,
    grey: chalk_1.default.grey,
    magentaBright: chalk_1.default.magentaBright,
    redBright: chalk_1.default.redBright,
    greenBright: chalk_1.default.greenBright,
    yellowBright: chalk_1.default.yellowBright,
    blueBright: chalk_1.default.blueBright,
    cyanBright: chalk_1.default.cyanBright,
    whiteBright: chalk_1.default.whiteBright,
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
function humanize(n, o) {
    const options = o || {};
    const d = options.delimiter || ",";
    const s = options.separator || ".";
    const number = n.toString().split(".");
    number[0] = number[0].replace(regexes.number, `$1${d}`);
    return number.join(s);
}
function getColorForTime(t) {
    const match = t.match(regexes.time);
    if (match) {
        const value = parseInt(match[1], 10);
        const unit = match[2];
        const milliseconds = unit === "ms" ? value : value * 1000;
        if (milliseconds < 50)
            return timeColorMap["<50ms"];
        if (milliseconds < 100)
            return timeColorMap["<100ms"];
        return timeColorMap[">=100ms"];
    }
    return chalk_1.default.gray;
}
function time(start) {
    const delta = Date.now() - start;
    const t = humanize(delta < 10000 ? `${delta}ms` : `${Math.round(delta / 1000)}s`);
    return t;
}
function ip(value) {
    if (!value)
        return false;
    return regexes.ipv4.test(value) || regexes.ipv6.test(value);
}
function getForwardedFor(value) {
    if (!value)
        return "-";
    const forwardedIps = value.split(",").map((v) => {
        const currentIp = v.trim();
        if (currentIp.includes(":")) {
            const splitted = currentIp.split(":");
            if (splitted.length === 2)
                return splitted[0];
        }
        return currentIp;
    });
    for (let i = 0; i < forwardedIps.length; i++) {
        if (ip(forwardedIps[i]))
            return forwardedIps[i];
    }
    return "-";
}
function getIp(req) {
    if (!req.headers)
        return "-";
    if (ip(req.headers["x-client-ip"])) {
        return req.headers["x-client-ip"];
    }
    const forwardedFor = getForwardedFor(req.headers["x-forwarded-for"]);
    if (forwardedFor !== "-")
        return forwardedFor;
    if (ip(req.headers["x-real-ip"])) {
        return req.headers["x-real-ip"];
    }
    if (ip(req.headers["x-forwarded"])) {
        return req.headers["x-forwarded"];
    }
    if (ip(req.headers["forwarded-for"])) {
        return req.headers["forwarded-for"];
    }
    if (req.socket && ip(req.socket.remoteAddress)) {
        return req.socket.remoteAddress;
    }
    if (req.connection) {
        if (ip(req.connection.remoteAddress)) {
            return req.connection.remoteAddress;
        }
    }
    return "-";
}
function pad2(num) {
    const str = String(num);
    return (str.length === 1 ? "0" : "") + str;
}
function date(dateTime) {
    const currentDate = dateTime.getUTCDate();
    const hour = dateTime.getUTCHours();
    const mins = dateTime.getUTCMinutes();
    const secs = dateTime.getUTCSeconds();
    const year = dateTime.getUTCFullYear();
    const month = MONTHS[dateTime.getUTCMonth()];
    return (pad2(currentDate) +
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
        " +0000");
}
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
function colorizedFn(color) {
    let colorized = chalk_1.default.gray;
    if (typeof color === "function") {
        colorized = color;
    }
    else {
        colorized = chalkColorsMap[color] || chalk_1.default.gray;
    }
    return colorized;
}
const REQUEST = {
    ":method": (req) => req.method,
    ":url": (req) => req.originalUrl || req.url,
    ":date": () => date(new Date()),
    ":remote-address": (req) => getIp(req),
    ":referrer": (req) => (req.headers.referer || req.headers.referrer || "-"),
    ":user-agent": (req) => req.headers["user-agent"] || "-",
    ":http-version": (req) => "HTTP/" + req.httpVersionMajor + "." + req.httpVersionMinor,
};
const RESPONSE = {
    ":date": () => date(new Date()),
    ":status": (_, res, err) => {
        const status = err ? err.status || 500 : res.statusCode || 404;
        const s = (status / 100) | 0;
        const color = colorCodes.hasOwnProperty(s) ? colorCodes[s] : colorCodes[0];
        return {
            value: status,
            colorized: chalkColorsMap[color],
        };
    },
    ":content-length": (_, res, err) => {
        const status = err ? err.status || 500 : res.statusCode || 404;
        const contentLength = res.getHeader("content-length")
            ? parseInt(res.getHeader("content-length"), 10)
            : null;
        let length;
        if ([204, 205, 304].includes(status)) {
            length = "";
        }
        else if (contentLength == null) {
            length = "-";
        }
        else {
            length = (0, bytes_1.default)(contentLength).toLowerCase();
        }
        return length;
    },
    ":response-time": (_, res) => {
        const start = res.getHeader("x-start-time");
        const t = time(Number(start));
        return {
            value: t,
            colorized: getColorForTime(t),
        };
    },
    ":method": (req) => req.method,
    ":url": (req) => req.originalUrl || req.url,
};
function interpolate(token, color) {
    if (token.match(regexes.token)) {
        const t = token.replace(regexes.tokenWithourBrackets, "");
        return (isRequest, req, res, err) => {
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
    return (isRequest, req, res, err) => {
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
const REQUEST_TOKENS = {
    ":method": (token) => interpolate(token, "whiteBright"),
    ":url": (token) => interpolate(token, "magenta"),
    ":date": (token) => interpolate(token, "gray"),
    ":remote-address": (token) => interpolate(token, "gray"),
    ":referrer": (token) => interpolate(token, "gray"),
    ":user-agent": (token) => interpolate(token, "gray"),
    ":http-version": (token) => interpolate(token, "gray"),
};
const RESPONSE_TOKENS = {
    ":date": (token) => interpolate(token, "gray"),
    ":status": (token) => interpolate(token, ""),
    ":content-length": (token) => interpolate(token, "gray"),
    ":response-time": (token) => interpolate(token, "gray"),
    ":method": (token) => interpolate(token, "whiteBright"),
    ":url": (token) => interpolate(token, "magenta"),
};
const parsedTokens = {};
function extractTokens(format) {
    if (parsedTokens[format])
        return parsedTokens[format];
    let flagIncomingSet = false;
    const tokens = format
        .split(regexes.tokenFormat)
        .filter((token) => token.trim() !== "")
        .map((token) => token.replace(/\s/g, ""))
        .filter((token) => {
        const tokenWithoutBrackets = token.replace(regexes.tokenWithourBrackets, "");
        if (tokenWithoutBrackets === ":incoming")
            flagIncomingSet = true;
        return TOKENS.includes(tokenWithoutBrackets);
    });
    parsedTokens[format] = {
        tokens,
        flagIncomingSet,
    };
    return parsedTokens[format];
}
function compile(format) {
    const { flagIncomingSet, tokens } = extractTokens(format);
    const requestOutput = flagIncomingSet ? [chalk_1.default.gray("[INCOMING]")] : [];
    const responseOutput = flagIncomingSet ? [chalk_1.default.gray("[OUTGOING]")] : [];
    const requstArgs = [];
    const responseArgs = [];
    let i = -999;
    tokens.forEach((token) => {
        const value = token.replace(regexes.tokenWithourBrackets, "");
        if (value === ":incoming") {
            requestOutput.push(chalk_1.default.gray("<--"));
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
    const logRequest = (request, response, error, print) => {
        const compiledArgs = requstArgs.map((fn) => fn(true, request, response, error));
        const string = util_1.default.format(requestOutput.join(" "), ...compiledArgs);
        print(string);
    };
    const logResponse = (request, response, error, event, print) => {
        const compiledArgs = responseArgs.map((fn) => fn(false, request, response, error));
        if (i !== -999) {
            let upstream;
            if (error) {
                upstream = chalk_1.default.red("xxx");
            }
            else if (event === "close") {
                upstream = chalk_1.default.yellow("-x-");
            }
            else if (response.statusCode >= 500) {
                upstream = chalk_1.default.red("xxx");
            }
            else if (response.statusCode === 404) {
                upstream = chalk_1.default.cyan("-X-");
            }
            else {
                upstream = chalk_1.default.gray("-->");
            }
            responseOutput[i] = upstream;
        }
        const string = util_1.default.format(responseOutput.join(" "), ...compiledArgs);
        print(string);
    };
    return { logRequest, logResponse };
}
function transporter(options) {
    let transport;
    if (typeof options === "function")
        transport = options;
    else if (options === null || options === void 0 ? void 0 : options.transporter)
        transport = options.transporter;
    return (...args) => {
        const string = util_1.default.format(...args);
        if (transport)
            transport(string, args);
        else
            console.log(...args);
    };
}
const logger = (format, options) => {
    const print = transporter(options);
    const { logRequest, logResponse } = compile(format || DEFAULT_FORMAT);
    return (request, response, next) => {
        const start = Date.now();
        response.setHeader("x-start-time", start);
        logRequest(request, response, null, print);
        const onfinish = done.bind(null, "finish");
        const onclose = done.bind(null, "close");
        response.once("finish", onfinish);
        response.once("close", onclose);
        function done(event) {
            response.removeListener("finish", onfinish);
            response.removeListener("close", onclose);
            logResponse(request, response, null, event, print);
        }
        next();
    };
};
module.exports = logger;
//# sourceMappingURL=index.js.map