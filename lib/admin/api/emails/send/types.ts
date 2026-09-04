export type ParamsT4003933915 = {};
export type JsonTPOST389761796 = {
  ids: VRefine<Array<string>, {
    minItems: 1;
    maxItems: 200
  }>
};
export type ResponseTPOST3865300521 = {
  outcomes: Array<(({
    id: string;
    ok: true;
    email: {
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
    }
  }) | ({
    id: string;
    ok: false;
    code: (("not_found") | ("not_ready") | ("no_provider") | ("already_sending") | ("provider_error") | ("provider_not_implemented"));
    message: string
  }))>
};
