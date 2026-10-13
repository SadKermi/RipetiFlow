import { describe, expect, it } from "vitest";
import { toWhatsAppNumber, whatsAppLink } from "./phone";

describe("toWhatsAppNumber", () => {
  it.each([
    // Italian mobiles, written in every way tutors type them
    ["3331234567", "393331234567"],
    ["333 123 4567", "393331234567"],
    ["333.123.45.67", "393331234567"],
    ["333-1234567", "393331234567"],
    ["(333) 1234567", "393331234567"],
    ["333/1234567", "393331234567"],
    ["333123456", "39333123456"], // 9-digit mobile (older numbers)
    ["3921234567", "393921234567"], // 39x is a mobile prefix too: not mistaken for the country code
    // Italian landlines keep their leading 0 after +39
    ["06 1234 5678", "390612345678"],
    ["02-12345678", "390212345678"],
    ["0546 12345", "39054612345"],
    // Already international
    ["+39 333 123 4567", "393331234567"],
    ["0039 333 123 4567", "393331234567"],
    ["+39 06 1234 5678", "390612345678"],
    ["+44 20 7946 0958", "442079460958"],
    ["+1 (555) 123-4567", "15551234567"],
    ["0041 44 668 18 00", "41446681800"],
    // Country code written without "+"
    ["393331234567", "393331234567"],
    ["39 06 1234 5678", "390612345678"],
    ["  +39 333 1234567  ", "393331234567"],
  ])("%j → %s", (raw, expected) => {
    expect(toWhatsAppNumber(raw)).toBe(expected);
  });

  it.each([
    [null],
    [undefined],
    [""],
    ["   "],
    ["abc"],
    ["333 123 456a"],
    ["12345"], // too short to be anything
    ["+39"],
    ["+12"],
    ["00"],
    ["+39 333 1234567 int. 2"],
    ["1234567890"], // 10 digits, not Italian: country unknown
    ["4412345678"],
    ["+1234567890123456"], // longer than E.164
    ["33312345678901"], // too long for an Italian mobile
  ])("returns null when unsure: %j", (raw) => {
    expect(toWhatsAppNumber(raw)).toBeNull();
  });
});

describe("whatsAppLink", () => {
  it("builds wa.me links with an encoded message", () => {
    expect(whatsAppLink("333 1234567", "Ciao! Lezione di domani alle 15:00?")).toBe(
      "https://wa.me/393331234567?text=Ciao!%20Lezione%20di%20domani%20alle%2015%3A00%3F",
    );
    expect(whatsAppLink("333 1234567")).toBe("https://wa.me/393331234567");
  });

  it("falls back to a recipient-less link when the number is unknown", () => {
    expect(whatsAppLink(null, "Saldo: 45,00 €")).toBe(
      "https://wa.me/?text=Saldo%3A%2045%2C00%20%E2%82%AC",
    );
    expect(whatsAppLink("boh")).toBe("https://wa.me/");
  });
});
