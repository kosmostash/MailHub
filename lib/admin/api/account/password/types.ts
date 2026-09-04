export type ParamsT3182389174 = {};
export type JsonTPOST3464874783 = {
  newPassword: VRefine<string, {
    minLength: 8;
    maxLength: 200
  }>
};
export type ResponseTPOST3747237406 = {
  confirmation: {
    method: (("totp") | ("email"));
    sentTo: ((string) | (null));
    expiresAt: string
  }
};
