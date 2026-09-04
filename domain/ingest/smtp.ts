import { type AddressObject, type ParsedMail, simpleParser } from "mailparser";
import { SMTPServer, type SMTPServerSession } from "smtp-server";

import { db } from "../db";
import { DomainError } from "../errors";
import { type AddressInput, resolveSubmissionTarget, storeEmail, type SubmissionCollection } from "../emails";

/**
 * SMTP ingestion (spec §3.6). The collection id is the credential (as the SMTP password,
 * or the username - either works). Accepted messages are stored, never relayed; 250 means
 * the row is committed.
 * */
export type SmtpListenerOptions = {
  host: string;
  port: number;
  maxMessageBytes: number;
  log?: (message: string) => void;
};

type Session = SMTPServerSession & { collection?: SubmissionCollection };

const authError = (code: number, enhanced: string, message: string) => {
  const error = new Error(`${enhanced} ${message}`) as Error & { responseCode: number };
  error.responseCode = code;
  return error;
};

const addresses = (value: AddressObject | Array<AddressObject> | undefined): Array<AddressInput> =>
  (Array.isArray(value) ? value : value ? [value] : [])
    .flatMap((group) => group.value)
    .filter((a) => typeof a.address === "string" && a.address)
    .map((a) => (a.name ? { address: a.address!, name: a.name } : { address: a.address! }));

/** Envelope recipients absent from To/Cc are the Bcc: the header itself is normally stripped. */
export const parsedToSubmission = (parsed: ParsedMail, envelopeRecipients: Array<string>) => {
  const to = addresses(parsed.to);
  const cc = addresses(parsed.cc);
  const headerBcc = addresses(parsed.bcc);
  const visible = new Set(
    [...to, ...cc, ...headerBcc].map((a) => (typeof a === "string" ? a : a.address).toLowerCase()),
  );
  const bcc: Array<AddressInput> = [
    ...headerBcc,
    ...envelopeRecipients.filter((r) => !visible.has(r.toLowerCase())).map((address) => ({ address })),
  ];
  const from = addresses(parsed.from)[0];
  return {
    from: from ?? "",
    to,
    cc,
    bcc,
    subject: parsed.subject ?? "",
    text: typeof parsed.text === "string" ? parsed.text : undefined,
    html: typeof parsed.html === "string" ? parsed.html : undefined,
  };
};

export const createSmtpListener = (options: SmtpListenerOptions) => {
  const log = options.log ?? (() => {});

  const server = new SMTPServer({
    authOptional: false,
    allowInsecureAuth: true,
    disabledCommands: ["STARTTLS"],
    size: options.maxMessageBytes,
    disableReverseLookup: true,
    logger: false,
    authMethods: ["PLAIN", "LOGIN"],

    async onAuth(auth, session: Session, callback) {
      try {
        // the collection id is the credential; accept it in either field
        const candidates = [auth.password, auth.username].filter((v): v is string => Boolean(v));
        let target: Awaited<ReturnType<typeof resolveSubmissionTarget>> = { status: "unknown" };
        for (const candidate of candidates) {
          target = await resolveSubmissionTarget(candidate);
          if (target.status !== "unknown") {
            break;
          }
        }
        if (target.status === "unknown") {
          return callback(authError(535, "5.7.8", "Unknown collection"));
        }
        if (target.status !== "ok") {
          return callback(
            authError(535, "5.7.1", `Collection suspended (${target.status.replace("_", " ")})`),
          );
        }
        session.collection = target.collection;
        return callback(null, { user: target.collection.id });
      } catch (error) {
        log(`auth error: ${error instanceof Error ? error.message : String(error)}`);
        return callback(authError(451, "4.3.0", "Temporary failure, try again"));
      }
    },

    async onData(stream, session: Session, callback) {
      try {
        const parsed = await simpleParser(stream, { skipImageLinks: true, skipTextLinks: true } as never);
        if (stream.sizeExceeded) {
          return callback(authError(552, "5.3.4", "Message exceeds the size limit"));
        }
        const collection = session.collection;
        if (!collection) {
          return callback(authError(530, "5.7.0", "Authentication required"));
        }
        // re-check suspension at data time: disabling bites immediately (spec §6)
        const target = await resolveSubmissionTarget(collection.id);
        if (target.status !== "ok") {
          return callback(authError(550, "5.7.1", "Collection suspended"));
        }
        const submission = parsedToSubmission(
          parsed,
          session.envelope.rcptTo.map((r) => r.address),
        );
        const stored = await storeEmail(target.collection, submission, "smtp", db());
        log(`stored ${stored.id} (${stored.state}) for collection ${collection.name}`);
        return callback(null, `2.0.0 Stored as ${stored.id} (${stored.state})`);
      } catch (error) {
        if (error instanceof DomainError) {
          return callback(authError(550, "5.6.0", error.message));
        }
        log(`store error: ${error instanceof Error ? error.message : String(error)}`);
        return callback(authError(451, "4.3.0", "Temporary failure, message not stored"));
      }
    },
  });

  server.on("error", (error) => log(`server error: ${error.message}`));

  return {
    start: () =>
      new Promise<number>((resolve, reject) => {
        server.once("error", reject);
        server.listen(options.port, options.host, () => {
          server.removeListener("error", reject);
          const address = server.server.address();
          resolve(typeof address === "object" && address ? address.port : options.port);
        });
      }),
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
};
