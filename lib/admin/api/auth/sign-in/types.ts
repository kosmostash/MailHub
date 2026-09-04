export type ParamsT1395169366 = {};
export type JsonTPOST1267901807 = {
  email: VRefine<string, {
    format: "email"
  }>;
  password: VRefine<string, {
    minLength: 1;
    maxLength: 200
  }>;
  totpCode?: VRefine<string, {
    maxLength: 20
  }>
};
export type ResponseTPOST2723787278 = {
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
