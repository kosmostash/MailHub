export type ParamsT3794129943 = {};
export type QueryTGET2858948958 = {
  adminId?: string
};
export type ResponseTGET1311915496 = {
  providers: Array<{
    id: string;
    adminId: string;
    name: string;
    type: string;
    config: ((Record<string, unknown>) | (null));
    collections: number;
    createdAt: string;
    updatedAt: string
  }>
};
export type JsonTPOST2858948958 = {
  name: VRefine<string, {
    minLength: 1;
    maxLength: 100
  }>;
  type: VRefine<string, {
    minLength: 1;
    maxLength: 40
  }>;
  config: Record<string, unknown>
};
export type ResponseTPOST3437211264 = {
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
