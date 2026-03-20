import { describe, expect, it } from "vitest";
import { parseEnvLines, parseHeaderLines } from "./parse-headers";

describe("parseHeaderLines", () => {
  it("parses headers, trims whitespace, and keeps text after the first colon", () => {
    expect(
      parseHeaderLines(`
        Authorization: Bearer token
        X-Custom-Header:  spaced value
        X-Trace: one:two:three
      `),
    ).toEqual({
      Authorization: "Bearer token",
      "X-Custom-Header": "spaced value",
      "X-Trace": "one:two:three",
    });
  });

  it("skips blank or invalid lines and overwrites duplicate keys with the last value", () => {
    expect(
      parseHeaderLines(`
        no delimiter here
        : missing-name

        Accept: application/json
        Accept: text/plain
      `),
    ).toEqual({
      Accept: "text/plain",
    });
  });
});

describe("parseEnvLines", () => {
  it("parses env entries, trims whitespace, and keeps text after the first equals sign", () => {
    expect(
      parseEnvLines(`
        GROK_API_KEY = secret
        COMPLEX = one=two=three
      `),
    ).toEqual({
      GROK_API_KEY: "secret",
      COMPLEX: "one=two=three",
    });
  });

  it("skips blank or invalid lines and overwrites duplicate keys with the last value", () => {
    expect(
      parseEnvLines(`
        invalid line
        = missing-name

        MODE=fast
        MODE=reasoning
      `),
    ).toEqual({
      MODE: "reasoning",
    });
  });
});
