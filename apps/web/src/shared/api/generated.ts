/* eslint-disable */
/* tslint:disable */
// @ts-nocheck
/*
 * ---------------------------------------------------------------
 * ## THIS FILE WAS GENERATED VIA SWAGGER-TYPESCRIPT-API        ##
 * ##                                                           ##
 * ## AUTHOR: acacode                                           ##
 * ## SOURCE: https://github.com/acacode/swagger-typescript-api ##
 * ---------------------------------------------------------------
 */

export interface RegistrationDto {
  /**
   * @format email
   * @maxLength 254
   * @pattern ^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$
   */
  email: string;
  /** @pattern ^[A-Za-z0-9_]{3,30}$ */
  username: string;
  /**
   * @minLength 8
   * @maxLength 128
   */
  password: string;
}

export interface CurrentUserDto {
  id: string;
  /**
   * @format email
   * @pattern ^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$
   */
  email: string;
  username: string;
}

export interface ErrorDto {
  code: string;
  message: string;
  fields?: Record<string, string[]>;
}

export interface LoginDto {
  /**
   * @format email
   * @maxLength 254
   * @pattern ^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$
   */
  email: string;
  /**
   * @minLength 8
   * @maxLength 128
   */
  password: string;
}

export interface UsersPageDto {
  items: {
    id: string;
    username: string;
  }[];
  /** @minLength 1 */
  nextCursor: string | null;
}

export interface StartConversationDto {
  /** @pattern ^[a-f0-9]{24}$ */
  userId: string;
}

export interface ConversationDto {
  /** @pattern ^[a-f0-9]{24}$ */
  id: string;
  counterpart: {
    id: string;
    username: string;
  };
  /**
   * @format date-time
   * @pattern ^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))T(?:(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z))$
   */
  createdAt: string;
  lastMessage: {
    /** @pattern ^[a-f0-9]{24}$ */
    id: string;
    /** @pattern ^[a-f0-9]{24}$ */
    conversationId: string;
    /** @pattern ^[a-f0-9]{24}$ */
    senderId: string;
    /**
     * @minLength 1
     * @maxLength 2000
     */
    text: string;
    attemptId: string;
    /**
     * @format date-time
     * @pattern ^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))T(?:(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z))$
     */
    createdAt: string;
  } | null;
}

export interface ConversationsPageDto {
  items: {
    /** @pattern ^[a-f0-9]{24}$ */
    id: string;
    counterpart: {
      id: string;
      username: string;
    };
    /**
     * @format date-time
     * @pattern ^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))T(?:(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z))$
     */
    createdAt: string;
    lastMessage: {
      /** @pattern ^[a-f0-9]{24}$ */
      id: string;
      /** @pattern ^[a-f0-9]{24}$ */
      conversationId: string;
      /** @pattern ^[a-f0-9]{24}$ */
      senderId: string;
      /**
       * @minLength 1
       * @maxLength 2000
       */
      text: string;
      attemptId: string;
      /**
       * @format date-time
       * @pattern ^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))T(?:(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z))$
       */
      createdAt: string;
    } | null;
  }[];
  /** @minLength 1 */
  nextCursor: string | null;
}

export interface SendMessageDto {
  /**
   * @minLength 1
   * @maxLength 2000
   */
  text: string;
  /**
   * @minLength 1
   * @maxLength 100
   */
  attemptId: string;
}

export interface MessageDto {
  /** @pattern ^[a-f0-9]{24}$ */
  id: string;
  /** @pattern ^[a-f0-9]{24}$ */
  conversationId: string;
  /** @pattern ^[a-f0-9]{24}$ */
  senderId: string;
  /**
   * @minLength 1
   * @maxLength 2000
   */
  text: string;
  attemptId: string;
  /**
   * @format date-time
   * @pattern ^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))T(?:(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z))$
   */
  createdAt: string;
}

export interface MessagesPageDto {
  items: {
    /** @pattern ^[a-f0-9]{24}$ */
    id: string;
    /** @pattern ^[a-f0-9]{24}$ */
    conversationId: string;
    /** @pattern ^[a-f0-9]{24}$ */
    senderId: string;
    /**
     * @minLength 1
     * @maxLength 2000
     */
    text: string;
    attemptId: string;
    /**
     * @format date-time
     * @pattern ^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))T(?:(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z))$
     */
    createdAt: string;
  }[];
  /** @minLength 1 */
  nextCursor: string | null;
}

export type QueryParamsType = Record<string | number, any>;
export type ResponseFormat = keyof Omit<Body, "body" | "bodyUsed">;

export interface FullRequestParams extends Omit<RequestInit, "body"> {
  /** set parameter to `true` for call `securityWorker` for this request */
  secure?: boolean;
  /** request path */
  path: string;
  /** content type of request body */
  type?: ContentType;
  /** query params */
  query?: QueryParamsType;
  /** format of response (i.e. response.json() -> format: "json") */
  format?: ResponseFormat;
  /** request body */
  body?: unknown;
  /** base url */
  baseUrl?: string;
  /** request cancellation token */
  cancelToken?: CancelToken;
}

export type RequestParams = Omit<
  FullRequestParams,
  "body" | "method" | "query" | "path"
>;

export interface ApiConfig<SecurityDataType = unknown> {
  baseUrl?: string;
  baseApiParams?: Omit<RequestParams, "baseUrl" | "cancelToken" | "signal">;
  securityWorker?: (
    securityData: SecurityDataType | null,
  ) => Promise<RequestParams | void> | RequestParams | void;
  customFetch?: typeof fetch;
}

export interface HttpResponse<D extends unknown, E extends unknown = unknown>
  extends Response {
  data: D;
  error: E;
}

type CancelToken = Symbol | string | number;

export enum ContentType {
  Json = "application/json",
  JsonApi = "application/vnd.api+json",
  FormData = "multipart/form-data",
  UrlEncoded = "application/x-www-form-urlencoded",
  Text = "text/plain",
}

export class HttpClient<SecurityDataType = unknown> {
  public baseUrl: string = "";
  private securityData: SecurityDataType | null = null;
  private securityWorker?: ApiConfig<SecurityDataType>["securityWorker"];
  private abortControllers = new Map<CancelToken, AbortController>();
  private customFetch = (...fetchParams: Parameters<typeof fetch>) =>
    fetch(...fetchParams);

  private baseApiParams: RequestParams = {
    credentials: "same-origin",
    headers: {},
    redirect: "follow",
    referrerPolicy: "no-referrer",
  };

  constructor(apiConfig: ApiConfig<SecurityDataType> = {}) {
    Object.assign(this, apiConfig);
  }

  public setSecurityData = (data: SecurityDataType | null) => {
    this.securityData = data;
  };

  protected encodeQueryParam(key: string, value: any) {
    const encodedKey = encodeURIComponent(key);
    return `${encodedKey}=${encodeURIComponent(typeof value === "number" ? value : `${value}`)}`;
  }

  protected addQueryParam(query: QueryParamsType, key: string) {
    return this.encodeQueryParam(key, query[key]);
  }

  protected addArrayQueryParam(query: QueryParamsType, key: string) {
    const value = query[key];
    return value.map((v: any) => this.encodeQueryParam(key, v)).join("&");
  }

  protected toQueryString(rawQuery?: QueryParamsType): string {
    const query = rawQuery || {};
    const keys = Object.keys(query).filter(
      (key) => "undefined" !== typeof query[key],
    );
    return keys
      .map((key) =>
        Array.isArray(query[key])
          ? this.addArrayQueryParam(query, key)
          : this.addQueryParam(query, key),
      )
      .join("&");
  }

  protected addQueryParams(rawQuery?: QueryParamsType): string {
    const queryString = this.toQueryString(rawQuery);
    return queryString ? `?${queryString}` : "";
  }

  private contentFormatters: Record<ContentType, (input: any) => any> = {
    [ContentType.Json]: (input: any) =>
      input !== null && (typeof input === "object" || typeof input === "string")
        ? JSON.stringify(input)
        : input,
    [ContentType.JsonApi]: (input: any) =>
      input !== null && (typeof input === "object" || typeof input === "string")
        ? JSON.stringify(input)
        : input,
    [ContentType.Text]: (input: any) =>
      input !== null && typeof input !== "string"
        ? JSON.stringify(input)
        : input,
    [ContentType.FormData]: (input: any) => {
      if (input instanceof FormData) {
        return input;
      }

      return Object.keys(input || {}).reduce((formData, key) => {
        const property = input[key];
        formData.append(
          key,
          property instanceof Blob
            ? property
            : typeof property === "object" && property !== null
              ? JSON.stringify(property)
              : `${property}`,
        );
        return formData;
      }, new FormData());
    },
    [ContentType.UrlEncoded]: (input: any) => this.toQueryString(input),
  };

  protected mergeRequestParams(
    params1: RequestParams,
    params2?: RequestParams,
  ): RequestParams {
    return {
      ...this.baseApiParams,
      ...params1,
      ...(params2 || {}),
      headers: {
        ...(this.baseApiParams.headers || {}),
        ...(params1.headers || {}),
        ...((params2 && params2.headers) || {}),
      },
    };
  }

  protected createAbortSignal = (
    cancelToken: CancelToken,
  ): AbortSignal | undefined => {
    if (this.abortControllers.has(cancelToken)) {
      const abortController = this.abortControllers.get(cancelToken);
      if (abortController) {
        return abortController.signal;
      }
      return void 0;
    }

    const abortController = new AbortController();
    this.abortControllers.set(cancelToken, abortController);
    return abortController.signal;
  };

  public abortRequest = (cancelToken: CancelToken) => {
    const abortController = this.abortControllers.get(cancelToken);

    if (abortController) {
      abortController.abort();
      this.abortControllers.delete(cancelToken);
    }
  };

  public request = async <T = any, E = any>({
    body,
    secure,
    path,
    type,
    query,
    format,
    baseUrl,
    cancelToken,
    ...params
  }: FullRequestParams): Promise<HttpResponse<T, E>> => {
    const secureParams =
      ((typeof secure === "boolean" ? secure : this.baseApiParams.secure) &&
        this.securityWorker &&
        (await this.securityWorker(this.securityData))) ||
      {};
    const requestParams = this.mergeRequestParams(params, secureParams);
    const queryString = query && this.toQueryString(query);
    const payloadFormatter = this.contentFormatters[type || ContentType.Json];
    const responseFormat = format || requestParams.format;

    return this.customFetch(
      `${baseUrl || this.baseUrl || ""}${path}${queryString ? `?${queryString}` : ""}`,
      {
        ...requestParams,
        headers: {
          ...(requestParams.headers || {}),
          ...(type && type !== ContentType.FormData
            ? { "Content-Type": type }
            : {}),
        },
        signal:
          (cancelToken
            ? this.createAbortSignal(cancelToken)
            : requestParams.signal) || null,
        body:
          typeof body === "undefined" || body === null
            ? null
            : payloadFormatter(body),
      },
    ).then(async (response) => {
      const r = response as HttpResponse<T, E>;
      r.data = null as unknown as T;
      r.error = null as unknown as E;

      const responseToParse = responseFormat ? response.clone() : response;
      const data = !responseFormat
        ? r
        : await responseToParse[responseFormat]()
            .then((data) => {
              if (r.ok) {
                r.data = data;
              } else {
                r.error = data;
              }
              return r;
            })
            .catch((e) => {
              r.error = e;
              return r;
            });

      if (cancelToken) {
        this.abortControllers.delete(cancelToken);
      }

      if (!response.ok) throw data;
      return data;
    });
  };
}

/**
 * @title Chat API
 * @version 1.0
 * @contact
 */
export class Api<
  SecurityDataType extends unknown,
> extends HttpClient<SecurityDataType> {
  auth = {
    /**
     * No description
     *
     * @tags Auth
     * @name Register
     * @request POST:/api/auth/register
     * @response `201` `CurrentUserDto`
     * @response `400` `ErrorDto`
     * @response `409` `ErrorDto`
     */
    register: (data: RegistrationDto, params: RequestParams = {}) =>
      this.request<CurrentUserDto, ErrorDto>({
        path: `/api/auth/register`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Auth
     * @name Login
     * @request POST:/api/auth/login
     * @response `200` `CurrentUserDto`
     * @response `400` `ErrorDto`
     * @response `401` `ErrorDto`
     */
    login: (data: LoginDto, params: RequestParams = {}) =>
      this.request<CurrentUserDto, ErrorDto>({
        path: `/api/auth/login`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Auth
     * @name Logout
     * @request POST:/api/auth/logout
     * @secure
     * @response `204` `void`
     * @response `401` `ErrorDto`
     */
    logout: (params: RequestParams = {}) =>
      this.request<void, ErrorDto>({
        path: `/api/auth/logout`,
        method: "POST",
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Auth
     * @name Me
     * @request GET:/api/auth/me
     * @secure
     * @response `200` `CurrentUserDto`
     * @response `401` `ErrorDto`
     */
    me: (params: RequestParams = {}) =>
      this.request<CurrentUserDto, ErrorDto>({
        path: `/api/auth/me`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),
  };
  users = {
    /**
     * No description
     *
     * @tags Users
     * @name List
     * @request GET:/api/users
     * @secure
     * @response `200` `UsersPageDto`
     * @response `400` `ErrorDto`
     * @response `401` `ErrorDto`
     */
    list: (
      query?: {
        /**
         * @minLength 1
         * @maxLength 2048
         */
        cursor?: string;
        /** @maxLength 100 */
        search?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<UsersPageDto, ErrorDto>({
        path: `/api/users`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),
  };
  conversations = {
    /**
     * No description
     *
     * @tags Conversations
     * @name Start
     * @request POST:/api/conversations
     * @secure
     * @response `201` `ConversationDto`
     * @response `400` `ErrorDto`
     * @response `401` `ErrorDto`
     * @response `404` `ErrorDto`
     */
    start: (data: StartConversationDto, params: RequestParams = {}) =>
      this.request<ConversationDto, ErrorDto>({
        path: `/api/conversations`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Conversations
     * @name List
     * @request GET:/api/conversations
     * @secure
     * @response `200` `ConversationsPageDto`
     * @response `400` `ErrorDto`
     * @response `401` `ErrorDto`
     */
    list: (
      query?: {
        /**
         * @minLength 1
         * @maxLength 2048
         */
        cursor?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<ConversationsPageDto, ErrorDto>({
        path: `/api/conversations`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),
  };
  messages = {
    /**
     * No description
     *
     * @tags Messages
     * @name Send
     * @request POST:/api/conversations/{conversationId}/messages
     * @secure
     * @response `201` `MessageDto`
     * @response `400` `ErrorDto`
     * @response `401` `ErrorDto`
     * @response `404` `ErrorDto`
     * @response `409` `ErrorDto`
     */
    send: (
      conversationId: string,
      data: SendMessageDto,
      params: RequestParams = {},
    ) =>
      this.request<MessageDto, ErrorDto>({
        path: `/api/conversations/${conversationId}/messages`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Messages
     * @name List
     * @request GET:/api/conversations/{conversationId}/messages
     * @secure
     * @response `200` `MessagesPageDto`
     * @response `400` `ErrorDto`
     * @response `401` `ErrorDto`
     * @response `404` `ErrorDto`
     */
    list: (
      conversationId: string,
      query?: {
        /**
         * @minLength 1
         * @maxLength 2048
         */
        cursor?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<MessagesPageDto, ErrorDto>({
        path: `/api/conversations/${conversationId}/messages`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),
  };
}
