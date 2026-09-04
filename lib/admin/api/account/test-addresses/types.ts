export type ParamsT1262528991 = {};
export type ResponseTGET2281934027 = {
  testAddresses: Array<{
    id: string;
    address: string;
    label: ((string) | (null));
    createdAt: string
  }>
};
export type JsonTPOST3983687089 = {
  address: VRefine<string, {
    format: "email"
  }>;
  label?: VRefine<string, {
    maxLength: 100
  }>
};
export type ResponseTPOST2241009902 = {
  testAddress: {
    id: string;
    address: string;
    label: ((string) | (null));
    createdAt: string
  }
};
