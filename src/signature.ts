import crypto from "node:crypto";
import { BridgeConfig } from "./types";

export const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;

export function buildRequestSignature(timestamp: string, body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function verifyRequestSignature(
  rawBody: string,
  headers: Record<string, string | string[] | undefined>,
  config: Pick<BridgeConfig, "signSecret">
): { ok: true } | { ok: false; error: string } {
  const timestampHeader = headers["x-timestamp"];
  const signatureHeader = headers["x-signature"];

  const timestamp = Array.isArray(timestampHeader) ? timestampHeader[0] : timestampHeader;
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

  if (!timestamp) {
    return { ok: false, error: "缺少 x-timestamp 请求头" };
  }

  if (!signature) {
    return { ok: false, error: "缺少 x-signature 请求头" };
  }

  const timestampMs = Number(timestamp);
  if (!Number.isFinite(timestampMs) || !Number.isInteger(timestampMs)) {
    return { ok: false, error: "x-timestamp 格式无效" };
  }

  const age = Math.abs(Date.now() - timestampMs);
  if (age > SIGNATURE_MAX_AGE_MS) {
    return { ok: false, error: "请求已过期" };
  }

  const expected = buildRequestSignature(timestamp, rawBody, config.signSecret);
  const provided = signature.trim().toLowerCase();
  const expectedBuffer = Buffer.from(expected, "hex");
  const providedBuffer = Buffer.from(provided, "hex");

  if (expectedBuffer.length !== providedBuffer.length) {
    return { ok: false, error: "签名校验失败" };
  }

  if (!crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
    return { ok: false, error: "签名校验失败" };
  }

  return { ok: true };
}
