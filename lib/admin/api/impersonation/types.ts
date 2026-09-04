export type ParamsT99609533 = {};
export type JsonTPOST1315299790 = {
  userId: VRefine<string, {
    pattern: "^[0-9a-fA-F-]{36}$"
  }>
};
export type ResponseTPOST2526291999 = {
  actor: {
    id: string;
    role: (("superadmin") | ("admin") | ("operator"));
    adminId: ((string) | (null));
    email: string;
    disabled: boolean;
    disabledAt: ((string) | (null));
    totpEnabled: boolean;
    createdAt: string
  }
};
export type ResponseTDELETE2526291999 = {
  actor: {
    id: string;
    role: (("superadmin") | ("admin") | ("operator"));
    adminId: ((string) | (null));
    email: string;
    disabled: boolean;
    disabledAt: ((string) | (null));
    totpEnabled: boolean;
    createdAt: string
  }
};
