export type ParamsT2736070522 = {};
export type ResponseTGET10078479 = {
  needed: boolean
};
export type JsonTPOST2521546891 = {
  email: VRefine<string, {
    format: "email"
  }>;
  password: VRefine<string, {
    minLength: 8;
    maxLength: 200
  }>
};
export type ResponseTPOST3866410297 = {
  user: {
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
