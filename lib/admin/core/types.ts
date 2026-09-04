export type Override<A, B> = Omit<A, keyof B> & B;

export type StaticParams = {
  "activity": [  ];
  "account": [  ];
  "admins": [  ];
  "index": [  ];
  "operators": [  ];
  "providers": [  ];
  "sign-in": [  ];
  "collections/[id]": [ id: string | number ];
  "emails/[id]": [ id: string | number ];
};

export type LinkProps =
  | [ "activity",  ]
    | [ "account",  ]
    | [ "admins",  ]
    | [ "index",  ]
    | [ "operators",  ]
    | [ "providers",  ]
    | [ "sign-in",  ]
    | [ "collections/[id]", id: string | number ]
    | [ "emails/[id]", id: string | number ]
  ;
