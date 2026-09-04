export type Override<A, B> = Omit<A, keyof B> & B;

export type StaticParams = {
  "admins": [  ];
  "index": [  ];
  "operators": [  ];
  "sign-in": [  ];
};

export type LinkProps =
  | [ "admins",  ]
    | [ "index",  ]
    | [ "operators",  ]
    | [ "sign-in",  ]
  ;
