import { pinoConfig } from "./pino.config";

type RequestSerializer = (request: { url: string }) => { url: string };

function requestSerializer(): RequestSerializer {
  const config = pinoConfig("production").pinoHttp as {
    serializers: { req: RequestSerializer };
  };
  return config.serializers.req;
}

describe("pinoConfig", () => {
  it("redacts wallet search values from finance request URLs", () => {
    const request = {
      url: "/v1/finance/wallets?page=2&search=Ada%20Lovelace&isActive=true",
    };

    expect(requestSerializer()(request).url).toBe(
      "/v1/finance/wallets?page=2&search=[redacted]&isActive=true",
    );
  });

  it("redacts repeated, case-insensitive, and encoded search keys", () => {
    const request = {
      url: "/v1/finance/wallets?Search=Ada&%73earch=Grace&search=Linus",
    };

    expect(requestSerializer()(request).url).toBe(
      "/v1/finance/wallets?Search=[redacted]&%73earch=[redacted]&search=[redacted]",
    );
  });

  it("redacts option-selector and trailing-slash searches", () => {
    expect(
      requestSerializer()({
        url: "/v1/finance/wallet-options?search=owner%40example.com",
      }).url,
    ).toBe("/v1/finance/wallet-options?search=[redacted]");
    expect(
      requestSerializer()({
        url: "/v1/finance/wallets/?search=Ada",
      }).url,
    ).toBe("/v1/finance/wallets/?search=[redacted]");
  });

  it("leaves unrelated request URLs unchanged", () => {
    const url = "/v1/persons?search=Ada%20Lovelace";
    const request = {
      url,
    };

    expect(requestSerializer()(request).url).toBe(url);
  });
});
