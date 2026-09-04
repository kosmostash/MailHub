export type ParamsT668020972 = {
  "id": string
};
export type ResponseTGET3365993768 = {
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
