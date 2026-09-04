export type ParamsT4251240752 = {
  "id": string
};
export type ResponseTGET3570800203 = {
  collection: {
    id: string;
    name: string;
    scheduleMode: (("after_review") | ("immediate"));
    provider: (({
      id: string;
      name: string;
      type: string
    }) | (null));
    operator: {
      id: string;
      email: string;
      adminId: string
    };
    counters: {
      total: number;
      pending: number;
      ready: number;
      sent: number;
      delivered: number;
      bounced: number
    };
    createdAt: string;
    updatedAt: string
  }
};
export type JsonTPATCH1485796998 = {
  name?: VRefine<string, {
    minLength: 1;
    maxLength: 100
  }>;
  scheduleMode?: (("after_review") | ("immediate"));
  providerId?: ((string) | (null))
};
export type ResponseTPATCH3570800203 = {
  collection: {
    id: string;
    name: string;
    scheduleMode: (("after_review") | ("immediate"));
    provider: (({
      id: string;
      name: string;
      type: string
    }) | (null));
    operator: {
      id: string;
      email: string;
      adminId: string
    };
    counters: {
      total: number;
      pending: number;
      ready: number;
      sent: number;
      delivered: number;
      bounced: number
    };
    createdAt: string;
    updatedAt: string
  }
};
export type ResponseTDELETE3529178931 = {
  ok: true
};
