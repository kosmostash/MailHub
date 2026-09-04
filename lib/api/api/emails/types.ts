export type ParamsT1283582034 = {};
export type JsonTPOST2963885276 = {
  from: ((string) | ({
    address: string;
    name?: string
  }));
  to: VRefine<Array<((string) | ({
    address: string;
    name?: string
  }))>, {
    minItems: 1
  }>;
  cc?: Array<((string) | ({
    address: string;
    name?: string
  }))>;
  bcc?: Array<((string) | ({
    address: string;
    name?: string
  }))>;
  subject?: VRefine<string, {
    maxLength: 2000
  }>;
  text?: string;
  html?: string
};
export type ResponseTPOST62817405 = {
  id: string;
  collectionId: string;
  from: {
    address: string;
    name?: string
  };
  to: Array<{
    address: string;
    name?: string
  }>;
  cc: Array<{
    address: string;
    name?: string
  }>;
  bcc: Array<{
    address: string;
    name?: string
  }>;
  subject: string;
  text: ((string) | (null));
  html: ((string) | (null));
  state: (("pending") | ("ready") | ("sent"));
  deliveryStatus: (("unknown") | ("sent") | ("delivered") | ("bounced"));
  attempts: number;
  lastError: ((string) | (null));
  providerMessageId: ((string) | (null));
  source: (("http") | ("smtp"));
  createdAt: string;
  reviewedAt: ((string) | (null));
  sentAt: ((string) | (null))
};
