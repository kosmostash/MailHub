export type ParamsT2732594447 = {};
export type ResponseTGET1455946108 = {
  admins: Array<(({
    id: string;
    role: (("superadmin") | ("admin") | ("operator"));
    adminId: ((string) | (null));
    email: string;
    disabled: boolean;
    disabledAt: ((string) | (null));
    totpEnabled: boolean;
    createdAt: string
  }) & ({
    operators: number;
    providers: number;
    collections: number;
    pending: number;
    lastActivityAt: ((string) | (null))
  }))>
};
export type JsonTPOST3016094572 = {
  email: VRefine<string, {
    format: "email"
  }>;
  password: VRefine<string, {
    minLength: 8;
    maxLength: 200
  }>
};
export type ResponseTPOST1290459696 = {
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
