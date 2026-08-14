import { describe, expect, test } from "bun:test";
import {
  inputFromArgs,
  parseRetention,
  publishUrl
} from "../scripts/post-artifact";

const KEY = { apiKey: "test-key" };

describe("publish url", () => {
  test("preserves the default unprefixed URL", () => {
    expect(publishUrl({ file: "/tmp/REPORT.md", serviceUrl: "https://a.test", ...KEY }))
      .toBe("https://a.test/REPORT.md");
    expect(publishUrl({
      file: "/tmp/REPORT.md",
      retention: "30d",
      serviceUrl: "https://a.test",
      ...KEY
    })).toBe("https://a.test/REPORT.md");
  });

  test("adds non-default retention prefixes", () => {
    expect(publishUrl({
      file: "/tmp/REPORT.md",
      retention: "7d",
      serviceUrl: "https://a.test/",
      ...KEY
    })).toBe("https://a.test/7d/REPORT.md");
    expect(publishUrl({
      file: "/tmp/REPORT.md",
      retention: "archive",
      serviceUrl: "https://a.test",
      ...KEY
    })).toBe("https://a.test/archive/REPORT.md");
  });
});

describe("retention arguments", () => {
  test("accepts every tier and defaults to 30d", () => {
    expect(parseRetention()).toBe("30d");
    for (const retention of ["1d", "7d", "30d", "90d", "1y", "archive"]) {
      expect(parseRetention(retention)).toBe(retention);
    }
    expect(inputFromArgs(
      { file: "R.md", retention: "90d" },
      { ARTIFACTS_API_KEY: "k" }
    ).retention).toBe("90d");
  });

  test("rejects unknown tiers before publishing", () => {
    expect(() => parseRetention("forever")).toThrow("invalid --retention");
    expect(() => inputFromArgs(
      { file: "R.md", retention: "forever" },
      { ARTIFACTS_API_KEY: "k" }
    )).toThrow("invalid --retention");
  });
});
