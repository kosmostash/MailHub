export type ParamsT3756010019 = {
  "id": string
};
export type QueryTGET3570308899 = {
  state?: (("pending") | ("ready") | ("sent"));
  delivery?: (("unknown") | ("sent") | ("delivered") | ("bounced"));
  page?: VRefine<number, {
    minimum: 1
  }>;
  pageSize?: VRefine<number, {
    minimum: 1;
    maximum: 200
  }>
};
export type ResponseTGET1612803523 = {
  emails: Array<{
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
  }>;
  total: number;
  page: number;
  pageSize: number
};
