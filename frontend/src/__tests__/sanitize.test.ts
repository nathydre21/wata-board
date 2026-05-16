import { describe, it, expect } from "vitest";
import { sanitizeMeterId, isMeterIdValid } from "../utils/sanitize";

const xssPayloads = [
  "<script>alert(1)</script>",
  '" onmouseover="evil()',
  "javascript:void(0)",
  "<img src=x onerror=alert(1)>",
  "'; DROP TABLE meters;--",
  "A".repeat(51),
];

describe("sanitizeMeterId", () => {
  it("allows valid meter IDs", () => {
    expect(sanitizeMeterId("METER-001")).toBe("METER-001");
    expect(sanitizeMeterId("abc_123")).toBe("abc_123");
  });

  it("allows lowercase meter IDs", () => {
    expect(sanitizeMeterId("meter-456")).toBe("meter-456");
    expect(sanitizeMeterId("xyz_789")).toBe("xyz_789");
  });

  it("allows mixed case meter IDs", () => {
    expect(sanitizeMeterId("MeTeR-789")).toBe("MeTeR-789");
    expect(sanitizeMeterId("ABC_xyz")).toBe("ABC_xyz");
  });

  it("allows numbers and valid separators", () => {
    expect(sanitizeMeterId("001-002-003")).toBe("001-002-003");
    expect(sanitizeMeterId("meter_123_abc")).toBe("meter_123_abc");
  });

  it("rejects empty string", () => {
    expect(sanitizeMeterId("")).toBe("");
  });

  it("rejects string with only whitespace", () => {
    expect(sanitizeMeterId("   ")).toBe("");
  });

  it("rejects IDs longer than 50 characters", () => {
    expect(sanitizeMeterId("A".repeat(51))).toBe("");
  });

  it("accepts IDs with exactly 50 characters", () => {
    expect(sanitizeMeterId("A".repeat(50))).toBe("A".repeat(50));
  });

  it("rejects special characters", () => {
    expect(sanitizeMeterId("METER@001")).toBe("");
    expect(sanitizeMeterId("METER#001")).toBe("");
    expect(sanitizeMeterId("METER$001")).toBe("");
  });

  it("rejects HTML tags and entities", () => {
    expect(sanitizeMeterId("<tag>")).toBe("");
    expect(sanitizeMeterId("&lt;")).toBe("");
    expect(sanitizeMeterId("&amp;")).toBe("");
  });

  it("rejects SQL injection attempts", () => {
    expect(sanitizeMeterId("'; DROP TABLE;--")).toBe("");
    expect(sanitizeMeterId("1' OR '1'='1")).toBe("");
    expect(sanitizeMeterId("admin'--")).toBe("");
  });

  xssPayloads.forEach((payload) => {
    it(`blocks XSS payload: ${payload.slice(0, 30)}`, () => {
      expect(sanitizeMeterId(payload)).toBe("");
      expect(isMeterIdValid(payload)).toBe(false);
    });
  });

  it("rejects URL encoded payloads", () => {
    expect(sanitizeMeterId("%3Cscript%3E")).toBe("");
    expect(sanitizeMeterId("%27%20OR%201%3D1")).toBe("");
  });

  it("rejects Unicode and Unicode escapes", () => {
    expect(sanitizeMeterId("\\u003cscript\\u003e")).toBe("");
  });

  it("handles whitespace trimming", () => {
    expect(sanitizeMeterId("  METER-001  ")).toBe("METER-001");
    expect(sanitizeMeterId("\tMETER-001\n")).toBe("METER-001");
  });

  it("rejects strings with spaces in the middle", () => {
    expect(sanitizeMeterId("METER 001")).toBe("");
    expect(sanitizeMeterId("abc 123")).toBe("");
  });

  it("rejects only spaces", () => {
    expect(sanitizeMeterId("       ")).toBe("");
  });
});

describe("isMeterIdValid", () => {
  it("returns true for valid meter IDs", () => {
    expect(isMeterIdValid("METER-001")).toBe(true);
    expect(isMeterIdValid("abc_123")).toBe(true);
    expect(isMeterIdValid("MeTeR-789")).toBe(true);
  });

  it("returns false for invalid meter IDs", () => {
    expect(isMeterIdValid("<script>alert(1)</script>")).toBe(false);
    expect(isMeterIdValid("METER@001")).toBe(false);
    expect(isMeterIdValid("'; DROP TABLE;--")).toBe(false);
    expect(isMeterIdValid("A".repeat(51))).toBe(false);
    expect(isMeterIdValid("")).toBe(false);
    expect(isMeterIdValid("   ")).toBe(false);
  });

  it("returns false for XSS payloads", () => {
    xssPayloads.forEach((payload) => {
      expect(isMeterIdValid(payload)).toBe(
        false,
        `Should reject payload: ${payload.slice(0, 30)}`
      );
    });
  });

  it("matches sanitizeMeterId behavior", () => {
    const testIds = [
      "METER-001",
      "abc_123",
      "<script>alert(1)</script>",
      "METER@001",
      "'; DROP TABLE;--",
      "A".repeat(51),
      "",
      "   ",
    ];

    testIds.forEach((id) => {
      const sanitized = sanitizeMeterId(id);
      const isValid = isMeterIdValid(id);
      expect(isValid).toBe(sanitized !== "", `For id: ${id}`);
    });
  });
});
