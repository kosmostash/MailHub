export type ParamsT3821716503 = {
  "id": string
};
export type ResponseTGET418594052 = {
  provider: {
    id: string;
    adminId: string;
    name: string;
    type: string;
    config: ((Record<string, unknown>) | (null));
    collections: number;
    createdAt: string;
    updatedAt: string
  }
};
export type JsonTPATCH3118411284 = {
  name?: VRefine<string, {
    minLength: 1;
    maxLength: 100
  }>;
  config?: Record<string, unknown>
};
export type ResponseTPATCH418594052 = {
  provider: {
    id: string;
    adminId: string;
    name: string;
    type: string;
    config: ((Record<string, unknown>) | (null));
    collections: number;
    createdAt: string;
    updatedAt: string
  }
};
export type ResponseTDELETE2254060522 = {
  ok: true
};
