export type Override<A, B> = Omit<A, keyof B> & B;

export type StaticParams = {
  "admins": [  ];
  "index": [  ];
  "operators": [  ];
  "providers": [  ];
  "sign-in": [  ];
  "collections/[id]": [ id: string | number ];
};

export type LinkProps =
  | [ "admins",  ]
    | [ "index",  ]
    | [ "operators",  ]
    | [ "providers",  ]
    | [ "sign-in",  ]
    | [ "collections/[id]", id: string | number ]
  ;
