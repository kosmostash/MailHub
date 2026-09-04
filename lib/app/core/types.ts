export type Override<A, B> = Omit<A, keyof B> & B;

export type StaticParams = {
  "index": [  ];
};

export type LinkProps =
  | [ "index",  ]
  ;
