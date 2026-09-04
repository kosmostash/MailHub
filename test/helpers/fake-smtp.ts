import { type ParsedMail, simpleParser } from "mailparser";
import { SMTPServer } from "smtp-server";

/** A provider stand-in: accepts everything, records what it received. */
export type FakeSmtp = {
  port: number;
  messages: Array<ParsedMail & { envelope: { from: string | false; to: Array<string> } }>;
  stop: () => Promise<void>;
};

export const startFakeSmtp = (): Promise<FakeSmtp> =>
  new Promise((resolve, reject) => {
    const messages: FakeSmtp["messages"] = [];
    const server = new SMTPServer({
      authOptional: true,
      disabledCommands: ["AUTH", "STARTTLS"],
      disableReverseLookup: true,
      logger: false,
      async onData(stream, session, callback) {
        try {
          const parsed = await simpleParser(stream);
          messages.push({
            ...parsed,
            envelope: {
              from: session.envelope.mailFrom ? session.envelope.mailFrom.address : false,
              to: session.envelope.rcptTo.map((r) => r.address),
            },
          });
          callback(null, "queued");
        } catch (error) {
          callback(error as Error);
        }
      },
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.server.address();
      resolve({
        port: typeof address === "object" && address ? address.port : 0,
        messages,
        stop: () => new Promise((r) => server.close(() => r())),
      });
    });
  });

/** A port nobody listens on: provider errors, fast. */
export const closedPort = async (): Promise<number> => {
  const { createServer } = await import("node:net");
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
  });
};
