export type ParamsT176132705 = {
  "id": string
};
export type ResponseTGET716972949 = {
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
export type JsonTPOST100001437 = {
  targetId: VRefine<string, {
    minLength: 1
  }>
};
export type ResponseTPOST2715704513 = {
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
