export type Override<A, B> = Omit<A, keyof B> & B;

export type StaticParams = {
  "deploy": [  ];
  "index": [  ];
  "providers": [  ];
  "roles": [  ];
  "smtp": [  ];
  "submission": [  ];
};

export type LinkProps =
  | [ "deploy",  ]
    | [ "index",  ]
    | [ "providers",  ]
    | [ "roles",  ]
    | [ "smtp",  ]
    | [ "submission",  ]
  ;
