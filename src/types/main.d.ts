export declare namespace OpenAIThrottler {
  export enum RequestStatus {
    Success,
    Fail,
    Pending,
  }

  export interface RequestQueueItem {
    id: string;
    batchId: number;
    status?: RequestStatus;
    prompt: string;
    result?: AxiosResponse<CreateChatCompletionResponse, any>;
    finalized: boolean;
    tokenCount: number;
    retryCount: number;
  }

  export interface Queue {
    [id: string]: {
      requests: RequestQueueItem[];
    };
  }

  export interface File {
    id: string;
  }

  export interface Prompt {
    id: string;
    text: string;
  }
}
