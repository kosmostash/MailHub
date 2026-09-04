export type ParamsT1115521599 = {
  "id": string
};
export type ResponseTGET3327166423 = {
  targets: Array<{
    id: string;
    role: (("superadmin") | ("admin") | ("operator"));
    adminId: ((string) | (null));
    email: string;
    disabled: boolean;
    disabledAt: ((string) | (null));
    totpEnabled: boolean;
    createdAt: string
  }>
};
export type JsonTPOST4241570055 = {
  targetId: VRefine<string, {
    minLength: 1
  }>
};
export type ResponseTPOST2989161051 = {
  summary: {
    from: {
      id: string;
      email: string
    };
    to: {
      id: string;
      email: string
    };
    collections: number;
    operators: number;
    providers: number;
    renamedProviders: Array<{
      id: string;
      from: string;
      to: string
    }>
  }
};
