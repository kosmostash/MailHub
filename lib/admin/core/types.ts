export type Override<A, B> = Omit<A, keyof B> & B;

export type StaticParams = {
  "account": [  ];
  "activity": [  ];
  "admins": [  ];
  "index": [  ];
  "operators": [  ];
  "providers": [  ];
  "sign-in": [  ];
  "collections/[id]": [ id: string | number ];
  "emails/[id]": [ id: string | number ];
};

export type LinkProps =
  | [ "account",  ]
    | [ "activity",  ]
    | [ "admins",  ]
    | [ "index",  ]
    | [ "operators",  ]
    | [ "providers",  ]
    | [ "sign-in",  ]
    | [ "collections/[id]", id: string | number ]
    | [ "emails/[id]", id: string | number ]
  ;
