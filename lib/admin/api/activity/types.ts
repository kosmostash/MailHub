export type ParamsT2893285722 = {};
export type QueryTGET697339557 = {
  adminId?: string;
  operatorId?: string;
  before?: string;
  limit?: VRefine<number, {
    minimum: 1;
    maximum: 200
  }>
};
export type ResponseTGET2185767782 = {
  entries: Array<{
    id: string;
    at: string;
    action: (("superadmin.created") | ("admin.created") | ("admin.password_reset") | ("admin.disabled") | ("admin.enabled") | ("admin.reassigned") | ("admin.deleted") | ("operator.created") | ("operator.password_reset") | ("operator.disabled") | ("operator.enabled") | ("operator.reassigned") | ("operator.deleted") | ("impersonation.started") | ("impersonation.ended") | ("collection.created") | ("collection.updated") | ("collection.deleted") | ("provider.created") | ("provider.updated") | ("provider.deleted") | ("email.approved") | ("email.sent") | ("email.send_failed") | ("email.test_sent") | ("account.email_changed") | ("account.password_changed") | ("account.totp_enabled") | ("account.totp_disabled") | ("test_address.created") | ("test_address.deleted"));
    objectType: (("user") | ("collection") | ("provider") | ("email") | ("test_address") | ("session"));
    objectId: ((string) | (null));
    actor: {
      id: ((string) | (null));
      email: ((string) | (null));
      role: (((("superadmin") | ("admin") | ("operator"))) | ("system"))
    };
    via: (({
      id: ((string) | (null));
      email: ((string) | (null))
    }) | (null));
    details: Record<string, unknown>
  }>;
  nextBefore: ((string) | (null))
};
