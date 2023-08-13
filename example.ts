import express from "express";
import Boom from "@hapi/boom";

import Logger from "./index";

const app = express();

const router = express.Router();

app.use(
  Logger(
    ":[date] :incoming :method :url :status :response-time :content-length :user-agent :http-version",
  ),
);

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
