/**
 * A scriptable AppLink double for integration tests. Unlike the official mock it echoes our
 * externalTrxId and lets each test choose the outcome. Every request body is still checked
 * with the official AppLink skill validator when the skill is installed.
 */
import { existsSync } from "node:fs";
import http from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

export type Recorded = { path: string; body: Record<string, unknown>; problems: string[] };
type Responder = (body: Record<string, unknown>) => Record<string, unknown> | "timeout";

const SERVICE_BY_PATH: Record<string, string> = {
  "/sms/send": "sms-send",
  "/ussd/send": "ussd-send",
  "/subscription/send": "subscription-register",
  "/otp/request": "otp-request",
  "/otp/verify": "otp-verify",
  "/caas/direct/debit": "caas-otp-generation",
  "/caas/otp/verify": "caas-otp-verify",
};

export const defaults: Record<string, Responder> = {
  "/caas/direct/debit": (b) => ({
    timeStamp: new Date().toISOString(),
    externalTrxId: b.externalTrxId,
    statusDetail: "Request successfully proceed. OTP will send to user.",
    requestCorrelator: `corr-${String(b.externalTrxId)}`,
    internalTrxId: "9110808020001876",
    statusCode: "P1003",
  }),
  "/caas/otp/verify": () => ({ statusCode: "S1000", statusDetail: "Success" }),
  "/otp/request": () => ({ version: "1.0", statusCode: "S1000", referenceNo: "213561321321613", statusDetail: "Success" }),
  "/otp/verify": () => ({ version: "1.0", statusCode: "S1000", subscriptionStatus: "REGISTERED", statusDetail: "Success", subscriberId: "tel:8801912345678" }),
  "/subscription/send": (b) => ({
    version: "1.0",
    statusCode: "S1000",
    statusDetail: "Success.",
    subscriptionStatus: b.action === "0" ? "UNREGISTERED." : "REGISTERED",
  }),
  "/sms/send": () => ({ version: "1.0", requestId: `req-${Date.now()}-${Math.random()}`, statusCode: "S1000", statusDetail: "Success." }),
  "/ussd/send": () => ({ version: "1.0", requestId: "1", timeStamp: "20190103165801", statusCode: "S1000", statusDetail: "Success." }),
};

export async function startFakeApplink() {
  const skillCatalog = join(homedir(), ".claude/plugins/cache/applink/applink/1.0.0/tools/catalog.mjs");
  type Skill = { findEntry: (id: string) => unknown; validatePayload: (entry: unknown, body: unknown) => { errors: string[] } };
  const skill = existsSync(skillCatalog) ? ((await import(skillCatalog)) as Skill) : null;
  const validator = skill ? (id: string, body: unknown) => skill.validatePayload(skill.findEntry(id), body).errors : null;

  const recorded: Recorded[] = [];
  const overrides = new Map<string, Responder[]>();

  const server = http.createServer((req, res) => {
    let text = "";
    req.on("data", (c) => (text += c));
    req.on("end", () => {
      const body = JSON.parse(text || "{}") as Record<string, unknown>;
      const path = req.url ?? "";
      const problems: string[] = [];
      const service = SERVICE_BY_PATH[path];
      if (validator && service) {
        const id = path === "/subscription/send" && body.action === "0" ? "subscription-unregister" : service;
        problems.push(...validator(id, body));
      }
      recorded.push({ path, body, problems });
      const queue = overrides.get(path);
      const responder = queue && queue.length ? queue.shift()! : defaults[path];
      if (!responder) {
        res.writeHead(404).end();
        return;
      }
      const out = responder(body);
      if (out === "timeout") return; // never answer
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(out));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;

  return {
    url: (path: string) => `http://127.0.0.1:${port}${path}`,
    recorded,
    /** Queue a one-off response for the next call to `path`. */
    next(path: string, responder: Responder) {
      overrides.set(path, [...(overrides.get(path) ?? []), responder]);
    },
    reset() {
      recorded.length = 0;
      overrides.clear();
    },
    hasValidator: validator !== null,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
