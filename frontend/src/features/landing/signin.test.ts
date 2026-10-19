import { describe, expect, it } from "vitest";
import {
  callbackError,
  classifyFailure,
  forgetSignIn,
  readSignInPageState,
  recallSignIn,
  rememberSignIn,
  signInLine,
  signInMethods,
} from "./signin";
import { CONFIG, SUPABASE_CONFIG } from "./testing";

describe("sign-in methods (03 §1–2)", () => {
  it("offers a method only when its flag is on and Supabase is configured", () => {
    expect(signInMethods(null)).toEqual({ google: false, email: false, demo: false });
    expect(signInMethods(SUPABASE_CONFIG)).toEqual({ google: true, email: true, demo: false });
    expect(signInMethods({ ...SUPABASE_CONFIG, supabase_publishable_key: "" })).toEqual({
      google: false,
      email: false,
      demo: false,
    });
    expect(signInMethods(CONFIG)).toEqual({ google: false, email: false, demo: true });
  });

  it("writes the line under the landing's CTA after the active methods", () => {
    expect(signInLine(SUPABASE_CONFIG)).toBe(
      "Entri con il tuo account Google o con un link via email, senza password.",
    );
    expect(signInLine({ ...SUPABASE_CONFIG, magic_link_enabled: false })).toBe(
      "Entri con il tuo account Google.",
    );
    expect(signInLine({ ...SUPABASE_CONFIG, google_login_enabled: false })).toBe(
      "Entri con un link via email, senza password.",
    );
    expect(signInLine(null)).toBe("Entri senza password.");
  });
});

describe("callback outcome", () => {
  it("reads errors from the query and from the fragment", () => {
    expect(callbackError("?code=abc", "")).toBeNull();
    expect(callbackError("?error=access_denied&error_description=Annullato", "")).toEqual({
      error: "access_denied",
      code: null,
      description: "Annullato",
    });
    expect(
      callbackError("", "#error=access_denied&error_code=otp_expired&error_description=x"),
    ).toEqual({ error: "access_denied", code: "otp_expired", description: "x" });
  });

  it("tells an expired link from a failed Google sign-in", () => {
    const expired = { error: "access_denied", code: "otp_expired", description: null };
    const denied = { error: "access_denied", code: null, description: null };
    expect(classifyFailure(expired, null)).toBe("link-expired");
    expect(classifyFailure(null, { method: "email", email: "a@b.it" })).toBe("link-expired");
    expect(classifyFailure(denied, { method: "google" })).toBe("google-failed");
    expect(classifyFailure(denied, null)).toBe("google-failed");
    expect(classifyFailure(null, null)).toBe("failed");
  });

  it("remembers the attempt across tabs and forgets it", () => {
    rememberSignIn({ method: "email", email: "d.marchi@esempio.it" });
    expect(recallSignIn()).toEqual({ method: "email", email: "d.marchi@esempio.it" });
    forgetSignIn();
    expect(recallSignIn()).toBeNull();
    window.localStorage.setItem("ripetiflow.signin-attempt", "{rotto");
    expect(recallSignIn()).toBeNull();
  });

  it("accepts only the known fields of the /accedi state", () => {
    expect(readSignInPageState({ signInError: "google", email: "a@b.it", x: 1 })).toEqual({
      signInError: "google",
      email: "a@b.it",
    });
    expect(readSignInPageState(null)).toEqual({});
    expect(readSignInPageState({ signInError: "altro" })).toEqual({});
  });
});
