export type Override<A, B> = Omit<A, keyof B> & B;

export type StaticParams = {
  "deploy": [  ];
  "providers": [  ];
  "index": [  ];
  "roles": [  ];
  "smtp": [  ];
  "submission": [  ];
};

export type LinkProps =
  | [ "deploy",  ]
    | [ "providers",  ]
    | [ "index",  ]
    | [ "roles",  ]
    | [ "smtp",  ]
    | [ "submission",  ]
  ;
