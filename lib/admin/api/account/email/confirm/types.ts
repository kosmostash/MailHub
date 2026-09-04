export type ParamsT3943355885 = {};
export type JsonTPOST3372350577 = {
  code: VRefine<string, {
    minLength: 1;
    maxLength: 20
  }>
};
export type ResponseTPOST2223531171 = {
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
