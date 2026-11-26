/**
 * AppLink endpoints, one variable per provisioned service. An unset endpoint means the API is
 * not enabled on our application: the client refuses locally instead of failing with E1309.
 */
import { env } from "../env";

const endpoints = {
  smsSend: env.APPLINK_SMS_SEND_URL,
  ussdSend: env.APPLINK_USSD_SEND_URL,
  subscriptionSend: env.APPLINK_SUBSCRIPTION_SEND_URL,
  subscriptionQueryBase: env.APPLINK_SUBSCRIPTION_QUERY_BASE_URL,
  subscriptionChargingInfo: env.APPLINK_SUBSCRIPTION_CHARGING_INFO_URL,
  otpRequest: env.APPLINK_OTP_REQUEST_URL,
  otpVerify: env.APPLINK_OTP_VERIFY_URL,
  caasOtpGeneration: env.APPLINK_CAAS_DEBIT_URL,
  caasOtpVerify: env.APPLINK_CAAS_OTP_VERIFY_URL,
} as const;

export type EndpointName = keyof typeof endpoints;

const ENV_NAMES: Record<EndpointName, string> = {
  smsSend: "APPLINK_SMS_SEND_URL",
  ussdSend: "APPLINK_USSD_SEND_URL",
  subscriptionSend: "APPLINK_SUBSCRIPTION_SEND_URL",
  subscriptionQueryBase: "APPLINK_SUBSCRIPTION_QUERY_BASE_URL",
  subscriptionChargingInfo: "APPLINK_SUBSCRIPTION_CHARGING_INFO_URL",
  otpRequest: "APPLINK_OTP_REQUEST_URL",
  otpVerify: "APPLINK_OTP_VERIFY_URL",
  caasOtpGeneration: "APPLINK_CAAS_DEBIT_URL",
  caasOtpVerify: "APPLINK_CAAS_OTP_VERIFY_URL",
};

export class ApplinkNotConfiguredError extends Error {
  constructor(name: string) {
    super(`[applink] ${name} is not configured on this server`);
    this.name = "ApplinkNotConfiguredError";
  }
}

export function isEnabled(name: EndpointName): boolean {
  return Boolean(endpoints[name]) && Boolean(env.APPLINK_APP_ID) && Boolean(env.APPLINK_PASSWORD);
}

export function requireEndpoint(name: EndpointName): string {
  const url = endpoints[name];
  if (!url) throw new ApplinkNotConfiguredError(ENV_NAMES[name]);
  return url;
}

export function credentials(): { applicationId: string; password: string } {
  if (!env.APPLINK_APP_ID || !env.APPLINK_PASSWORD) {
    throw new ApplinkNotConfiguredError("APPLINK_APP_ID / APPLINK_PASSWORD");
  }
  return { applicationId: env.APPLINK_APP_ID, password: env.APPLINK_PASSWORD };
}

/** What the app may show: which AppLink features are live. No secrets. */
export function capabilities() {
  return {
    phoneLink: isEnabled("otpRequest") && isEnabled("otpVerify"),
    subscription: isEnabled("subscriptionSend"),
    payments: isEnabled("caasOtpGeneration") && isEnabled("caasOtpVerify"),
    sms: isEnabled("smsSend"),
    ussd: isEnabled("ussdSend"),
    smsShortcode: env.APPLINK_SMS_SHORTCODE || null,
    ussdCode: env.APPLINK_USSD_CODE || null,
  };
}
