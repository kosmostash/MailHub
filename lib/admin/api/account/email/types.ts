export type ParamsT3661605060 = {};
export type JsonTPOST4227977922 = {
  newEmail: VRefine<string, {
    format: "email"
  }>
};
export type ResponseTPOST1637547959 = {
  confirmation: {
    method: (("totp") | ("email"));
    sentTo: ((string) | (null));
    expiresAt: string
  }
};
