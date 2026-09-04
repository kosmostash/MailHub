export type ParamsT3542471662 = {};
export type QueryTGET3852567927 = {
  operatorId?: string;
  adminId?: string
};
export type ResponseTGET2405364500 = {
  collections: Array<{
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
  }>
};
export type JsonTPOST3852567927 = {
  name: VRefine<string, {
    minLength: 1;
    maxLength: 100
  }>;
  scheduleMode?: (("after_review") | ("immediate"));
  providerId?: ((string) | (null))
};
export type ResponseTPOST3323964694 = {
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
