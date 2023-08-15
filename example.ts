import express from "express";
import Boom from "@hapi/boom";
import winston from "winston";

import chrona from "./index";

const app = express();

const router = express.Router();

class Logger {
  output: winston.Logger;

  public constructor() {
    this.output = winston.createLogger({
      level: "info",
    });
    this.output.add(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf((info) => {
            const { message, level } = info;
            return `${level}: ${message}`;
          }),
        ),
      }),
    );
  }

  public info(message: string) {
    this.output.info(message);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const logger = new Logger();

// winston as transporter
// app.use(
//   chrona(
//     ":[date] :incoming :method :url :status :response-time :content-length :user-agent :http-version",
//     (str) => logger.info(str),
//   ),
// );

// default format and transporter
app.use(
  chrona(
    ":[date] :incoming :[method] :url :[status] :[response-time] :[content-length] :user-agent :[http-version]",
  ),
);

function timeout(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

router.get("/users", async (_, res) => {
  await timeout(1000);
  return res.status(200).json({
    message: "Users fetched successfully",
    users: Array.from({ length: 200 }, (_, i) => ({
      id: i,
    })),
  });
});

router.post("/users", (_, res) => {
  return res.status(201).json({
    message: "Users created successfully",
  });
});

router.get("/200", (req, res) => {
  return res.status(200).send("OK");
});

router.get("/301", (req, res) => {
  return res.status(301).send("Moved Permanently");
});

router.get("/304", (req, res) => {
  return res.status(304).send("Not Modified");
});

router.get("/404", (req, res) => {
  return res.status(404).send("Not Found");
});

router.get("/500", (req, res) => {
  return res.status(500).send("Internal Server Error");
});

router.get("/500-boom", () => {
  throw Boom.badImplementation("Bad implementation");
});

router.get("/error", () => {
  throw new Error("Error");
});

app.use(router);

app.listen(3000, () => {
  console.log("Server started on port 3000");
});
