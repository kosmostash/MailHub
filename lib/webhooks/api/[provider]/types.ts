export type ParamsT2055526591 = {
  "provider": string
};
export type JsonTPOST86264359 = {
  events: VRefine<Array<{
    emailId?: string;
    messageId?: string;
    status: (("sent") | ("delivered") | ("bounced"))
  }>, {
    maxItems: 1000
  }>
};
export type ResponseTPOST1836480688 = {
  provider: string;
  matched: number;
  unmatched: number
};
