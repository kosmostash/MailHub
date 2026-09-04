export type ParamsT2171001370 = {};
export type ResponseTGET4127678278 = {
  operators: Array<(({
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
export type JsonTPOST3161559725 = {
  email: VRefine<string, {
    format: "email"
  }>;
  password: VRefine<string, {
    minLength: 8;
    maxLength: 200
  }>
};
export type ResponseTPOST1080207186 = {
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
